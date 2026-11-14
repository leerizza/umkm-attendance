"""Registration flows vs. Supabase Auth (GoTrue), with a fake GoTrue over httpx.

Regression: /auth/register and /auth/register-company used
GET /auth/v1/admin/users?email=… to find an already-registered user. GoTrue
ignores `email` there and returns the newest users first, so users[0] was an
unrelated account — whose password then got overwritten, unauthenticated.
Passwords must only ever be set after the OTP is verified, for the user_id the
verification returned.
"""
import uuid

import httpx
import pytest


class FakeGoTrue:
    def __init__(self):
        self.calls: list[tuple[str, str, dict | None]] = []
        self.existing_emails: set[str] = set()
        self.verify_user_id = str(uuid.uuid4())

    def _resp(self, method, url, status, payload):
        return httpx.Response(status, json=payload, request=httpx.Request(method, url))

    async def post(self, client, url, **kw):
        body = kw.get("json")
        self.calls.append(("POST", url, body))
        if url.endswith("/auth/v1/admin/users"):
            if body["email"] in self.existing_emails:
                return self._resp("POST", url, 422, {
                    "code": 422, "error_code": "email_exists",
                    "msg": "A user with this email address has already been registered",
                })
            return self._resp("POST", url, 200, {"id": str(uuid.uuid4()), "email": body["email"]})
        if url.endswith("/auth/v1/otp"):
            return self._resp("POST", url, 200, {})
        if url.endswith("/auth/v1/verify"):
            return self._resp("POST", url, 200, {
                "access_token": "a", "refresh_token": "r", "expires_at": 1,
                "user": {"id": self.verify_user_id, "email": body["email"]},
            })
        raise AssertionError(f"unexpected POST {url}")

    async def put(self, client, url, **kw):
        self.calls.append(("PUT", url, kw.get("json")))
        return self._resp("PUT", url, 200, {})

    async def get(self, client, url, **kw):
        self.calls.append(("GET", url, kw.get("params")))
        return self._resp("GET", url, 200, {"users": []})

    def password_writes(self):
        return [(u, b) for m, u, b in self.calls if m == "PUT" and "/admin/users/" in u]

    def user_listings(self):
        return [u for m, u, _ in self.calls if m == "GET" and u.endswith("/admin/users")]


@pytest.fixture
def gotrue(monkeypatch):
    g = FakeGoTrue()
    monkeypatch.setattr(httpx.AsyncClient, "post", lambda self, url, **kw: g.post(self, url, **kw))
    monkeypatch.setattr(httpx.AsyncClient, "put", lambda self, url, **kw: g.put(self, url, **kw))
    monkeypatch.setattr(httpx.AsyncClient, "get", lambda self, url, **kw: g.get(self, url, **kw))
    return g


def _employee_body(company_code, email="budi@gmail.com", **kw):
    return {"email": email, "password": "rahasia123", "full_name": "Budi",
            "company_code": company_code, **kw}


def _owner_body(email="owner@gmail.com", code="TOKOBARU", **kw):
    return {"email": email, "password": "rahasia123", "full_name": "Owner",
            "company_name": "Toko Baru", "company_code": code, **kw}


# ── step 1: never look up / modify an existing user ──────────────────────────

def test_register_existing_email_touches_no_user(client, gotrue, make_company):
    co = make_company()
    gotrue.existing_emails.add("budi@gmail.com")
    r = client.post("/auth/register", json=_employee_body(co["code"]))
    assert r.status_code == 200
    assert gotrue.user_listings() == []
    assert gotrue.password_writes() == []
    assert any(u.endswith("/auth/v1/otp") for _, u, _ in gotrue.calls)


def test_register_company_existing_email_touches_no_user(client, gotrue):
    gotrue.existing_emails.add("owner@gmail.com")
    r = client.post("/auth/register-company", json=_owner_body())
    assert r.status_code == 200
    assert gotrue.user_listings() == []
    assert gotrue.password_writes() == []


# ── step 2: password set only after OTP, for the verified user ───────────────

def test_verify_register_sets_password_for_verified_user(client, fake, gotrue, make_company):
    co = make_company()
    r = client.post("/auth/verify-register",
                    json={**_employee_body(co["code"], password="baru12345"), "token": "123456"})
    assert r.status_code == 200
    writes = gotrue.password_writes()
    assert len(writes) == 1
    url, body = writes[0]
    assert url.endswith(f"/admin/users/{gotrue.verify_user_id}")
    assert body == {"password": "baru12345"}
    assert fake.rows("profiles", id=gotrue.verify_user_id)[0]["company_id"] == co["id"]


def test_verify_register_without_password_still_works(client, fake, gotrue, make_company):
    """Older app builds don't send the password at verify time."""
    co = make_company()
    body = _employee_body(co["code"])
    body.pop("password")
    r = client.post("/auth/verify-register", json={**body, "token": "123456"})
    assert r.status_code == 200
    assert gotrue.password_writes() == []
    assert fake.rows("profiles", id=gotrue.verify_user_id)


def test_verify_register_existing_account_refused(client, fake, gotrue, make_company):
    co = make_company()
    fake.add("profiles", id=gotrue.verify_user_id, company_id=co["id"], role="admin", full_name="Lama")
    r = client.post("/auth/verify-register",
                    json={**_employee_body(co["code"]), "token": "123456"})
    assert r.status_code == 400
    assert gotrue.password_writes() == []
    assert fake.rows("profiles", id=gotrue.verify_user_id)[0]["role"] == "admin"  # untouched


def test_verify_register_company_existing_account_refused(client, fake, gotrue, make_company):
    co = make_company()
    fake.add("profiles", id=gotrue.verify_user_id, company_id=co["id"], role="employee", full_name="Lama")
    r = client.post("/auth/verify-register-company",
                    json={**_owner_body(), "token": "123456"})
    assert r.status_code == 400
    assert gotrue.password_writes() == []
    assert not fake.rows("companies", code="TOKOBARU")  # no orphan company


def test_verify_register_company_sets_password(client, fake, gotrue):
    r = client.post("/auth/verify-register-company",
                    json={**_owner_body(password="baru12345"), "token": "123456"})
    assert r.status_code == 200
    (url, body), = gotrue.password_writes()
    assert url.endswith(f"/admin/users/{gotrue.verify_user_id}")
    assert body == {"password": "baru12345"}
    assert fake.rows("companies", code="TOKOBARU")
    assert fake.rows("profiles", id=gotrue.verify_user_id)[0]["role"] == "admin"
