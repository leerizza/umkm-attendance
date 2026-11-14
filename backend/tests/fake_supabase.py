"""In-memory stand-in for the supabase-py client, enough for router tests.

Supports the query-builder subset used in this codebase:
select (with simple embeds like ``profiles(full_name)`` / ``companies(*)`` /
``profiles!leave_requests_user_id_fkey(...)``), eq/neq/gt/gte/lt/lte/in_/is_/
ilike/match/not_, order/range/limit, single/maybe_single, insert/update/
upsert/delete, count="exact"; plus auth.get_user / auth.admin.get_user_by_id
and storage.from_(...).

Behaviour mirrors supabase-py 2.x where routers depend on it:
- ``.single()`` with 0 or >1 rows raises (APIError PGRST116 in the real client)
- ``.maybe_single().execute()`` returns ``None`` when there is no row
"""
from __future__ import annotations

import copy
import re
import uuid
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any


class FakeAPIError(Exception):
    pass


@dataclass
class FakeResponse:
    data: Any
    count: int | None = None


# embed name -> FK column on the parent row (used when no "!hint" is given)
_EMBED_FK = {
    "profiles": "user_id",
    "companies": "company_id",
    "locations": "location_id",
    "attendance": "attendance_id",
}


def _split_top_level(s: str) -> list[str]:
    parts, depth, cur = [], 0, ""
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


def _cmp_val(v):
    return "" if v is None else v


class Query:
    def __init__(self, db: "FakeSupabase", table: str):
        self.db = db
        self.table_name = table
        self.op = "select"
        self.columns = "*"
        self.payload: Any = None
        self.filters: list = []
        self._negate_next = False
        self._order: list[tuple[str, bool]] = []
        self._range: tuple[int, int] | None = None
        self._limit: int | None = None
        self._single = False
        self._maybe_single = False
        self._count = False
        self._upsert_conflict: str | None = None

    # ── operations ────────────────────────────────────────────────────────
    def select(self, columns: str = "*", count: str | None = None, **_):
        if self.op == "select":
            self.columns = columns
        self._count = count == "exact"
        return self

    def insert(self, payload, **_):
        self.op, self.payload = "insert", payload
        return self

    def update(self, payload, **_):
        self.op, self.payload = "update", payload
        return self

    def upsert(self, payload, on_conflict: str | None = None, **_):
        self.op, self.payload, self._upsert_conflict = "upsert", payload, on_conflict
        return self

    def delete(self, **_):
        self.op = "delete"
        return self

    # ── filters ───────────────────────────────────────────────────────────
    def _add(self, fn):
        neg = self._negate_next
        self._negate_next = False
        self.filters.append((lambda r: not fn(r)) if neg else fn)
        return self

    @property
    def not_(self):
        self._negate_next = True
        return self

    def eq(self, col, val):
        return self._add(lambda r: r.get(col) == val)

    def neq(self, col, val):
        return self._add(lambda r: r.get(col) != val)

    def gt(self, col, val):
        return self._add(lambda r: r.get(col) is not None and r.get(col) > val)

    def gte(self, col, val):
        return self._add(lambda r: r.get(col) is not None and r.get(col) >= val)

    def lt(self, col, val):
        return self._add(lambda r: r.get(col) is not None and r.get(col) < val)

    def lte(self, col, val):
        return self._add(lambda r: r.get(col) is not None and r.get(col) <= val)

    def in_(self, col, vals):
        vals = list(vals)
        return self._add(lambda r: r.get(col) in vals)

    def is_(self, col, val):
        target = None if val in (None, "null") else val
        return self._add(lambda r: r.get(col) is target if target is None else r.get(col) == target)

    def ilike(self, col, pattern):
        rx = re.compile("^" + re.escape(pattern).replace("%", ".*").replace("_", ".") + "$", re.I)
        return self._add(lambda r: r.get(col) is not None and bool(rx.match(str(r.get(col)))))

    def match(self, d: dict):
        for k, v in d.items():
            self.eq(k, v)
        return self

    # ── modifiers ─────────────────────────────────────────────────────────
    def order(self, col, desc: bool = False, **_):
        self._order.append((col, desc))
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def limit(self, n, **_):
        self._limit = n
        return self

    def single(self):
        self._single = True
        return self

    def maybe_single(self):
        self._maybe_single = True
        return self

    # ── execution ─────────────────────────────────────────────────────────
    def _rows(self) -> list[dict]:
        return self.db.tables.setdefault(self.table_name, [])

    def _matching(self) -> list[dict]:
        return [r for r in self._rows() if all(f(r) for f in self.filters)]

    def _project(self, row: dict) -> dict:
        cols = _split_top_level(self.columns)
        out: dict = {}
        for c in cols:
            m = re.match(r"^(\w+)(?:!(\w+))?\((.*)\)$", c, re.S)
            if m:
                name, hint, inner = m.group(1), m.group(2), m.group(3)
                out[name] = self._embed(row, name, hint, inner)
            elif c == "*":
                out.update(copy.deepcopy(row))
            else:
                out[c] = copy.deepcopy(row.get(c))
        return out

    def _embed(self, row, name, hint, inner):
        fk = None
        if hint:
            if hint in row:
                fk = hint
            else:
                m = re.match(rf"^{self.table_name}_(\w+)_fkey$", hint)
                fk = m.group(1) if m else None
        fk = fk or _EMBED_FK.get(name)
        target_rows = self.db.tables.get(name, [])
        # one-to-many (e.g. employee_locations from profiles) is not needed here
        if fk and fk in row:
            match = next((t for t in target_rows if t.get("id") == row[fk]), None)
            if match is None:
                return None
            sub = Query(self.db, name)
            sub.columns = inner or "*"
            return sub._project(match)
        return None

    def execute(self):
        if self.op == "insert":
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for it in items:
                row = {"id": str(uuid.uuid4()), **copy.deepcopy(it)}
                self._rows().append(row)
                inserted.append(copy.deepcopy(row))
            return FakeResponse(inserted)

        if self.op == "upsert":
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            keys = (self._upsert_conflict or "id").split(",")
            out = []
            for it in items:
                existing = next(
                    (r for r in self._rows() if all(r.get(k) == it.get(k) for k in keys)), None
                )
                if existing:
                    existing.update(copy.deepcopy(it))
                    out.append(copy.deepcopy(existing))
                else:
                    row = {"id": str(uuid.uuid4()), **copy.deepcopy(it)}
                    self._rows().append(row)
                    out.append(copy.deepcopy(row))
            return FakeResponse(out)

        if self.op == "update":
            hits = self._matching()
            for r in hits:
                r.update(copy.deepcopy(self.payload))
            return FakeResponse([copy.deepcopy(r) for r in hits])

        if self.op == "delete":
            hits = self._matching()
            self.db.tables[self.table_name] = [r for r in self._rows() if r not in hits]
            return FakeResponse([copy.deepcopy(r) for r in hits])

        rows = self._matching()
        for col, desc in reversed(self._order):
            rows = sorted(rows, key=lambda r: _cmp_val(r.get(col)), reverse=desc)
        total = len(rows)
        if self._range:
            rows = rows[self._range[0]: self._range[1] + 1]
        if self._limit is not None:
            rows = rows[: self._limit]
        data = [self._project(r) for r in rows]

        if self._single:
            if len(data) != 1:
                raise FakeAPIError("JSON object requested, multiple (or no) rows returned")
            return FakeResponse(data[0], total if self._count else None)
        if self._maybe_single:
            if not data:
                return None
            return FakeResponse(data[0], total if self._count else None)
        return FakeResponse(data, total if self._count else None)


class _FakeAdmin:
    def __init__(self, db):
        self.db = db

    def get_user_by_id(self, user_id):
        u = self.db.auth_users.get(user_id)
        if not u:
            return SimpleNamespace(user=None)
        identities = [SimpleNamespace(provider=p) for p in u.get("providers", ["email"])]
        return SimpleNamespace(user=SimpleNamespace(id=user_id, email=u["email"], identities=identities))

    def delete_user(self, user_id, *a, **k):
        self.db.auth_users.pop(user_id, None)
        for t, uid in list(self.db.tokens.items()):
            if uid == user_id:
                self.db.tokens.pop(t)


class _FakeAuth:
    def __init__(self, db):
        self.db = db
        self.admin = _FakeAdmin(db)

    def get_user(self, token):
        user_id = self.db.tokens.get(token)
        if not user_id:
            raise FakeAPIError("invalid JWT")
        u = self.db.auth_users[user_id]
        return SimpleNamespace(user=SimpleNamespace(id=user_id, email=u["email"]))


class _FakeBucket:
    def __init__(self, db, name):
        self.db, self.name = db, name

    def remove(self, paths):
        self.db.storage_removed.extend(paths)
        return []

    def create_signed_url(self, path, expires_in, *a, **k):
        return {"signedURL": f"https://storage.test/{self.name}/{path}?exp={expires_in}"}


class _FakeStorage:
    def __init__(self, db):
        self.db = db

    def from_(self, name):
        return _FakeBucket(self.db, name)


class FakeSupabase:
    def __init__(self):
        self.reset()
        self.auth = _FakeAuth(self)
        self.storage = _FakeStorage(self)

    def reset(self):
        self.tables: dict[str, list[dict]] = {}
        self.auth_users: dict[str, dict] = {}
        self.tokens: dict[str, str] = {}
        self.storage_removed: list[str] = []

    def table(self, name: str) -> Query:
        return Query(self, name)

    from_ = table

    # ── seeding helpers ───────────────────────────────────────────────────
    def add(self, table: str, **row) -> dict:
        row.setdefault("id", str(uuid.uuid4()))
        self.tables.setdefault(table, []).append(row)
        return row

    def rows(self, table: str, **where) -> list[dict]:
        return [r for r in self.tables.get(table, []) if all(r.get(k) == v for k, v in where.items())]
