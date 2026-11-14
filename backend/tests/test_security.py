"""Rate limiting, superadmin key, CORS, docs exposure, health."""
import httpx
from slowapi import Limiter
from starlette.datastructures import Headers

from limiter import _get_user_or_ip, client_ip, limiter


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200


def test_docs_disabled_by_default(client):
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


# ── rate limiter ────────────────────────────────────────────────────────────
class _Req:
    def __init__(self, headers=None, host="10.0.0.1"):
        self.headers = Headers(headers or {})  # case-insensitive, like Starlette
        self.client = type("C", (), {"host": host})()


def test_client_ip_prefers_x_real_ip():
    assert client_ip(_Req({"x-real-ip": "1.2.3.4"})) == "1.2.3.4"
    assert client_ip(_Req()) == "10.0.0.1"


def test_unknown_bearer_falls_back_to_ip():
    """Regression (PR #15): a random Bearer header must not get its own bucket."""
    req = _Req({"authorization": "Bearer random-junk", "x-real-ip": "1.2.3.4"})
    assert _get_user_or_ip(req) == "ip:1.2.3.4"


def test_cached_token_keyed_by_user(client, make_company, make_user):
    co = make_company()
    prof, h = make_user(co)
    assert client.get("/auth/me", headers=h).status_code == 200  # puts token in cache
    req = _Req({"authorization": h["Authorization"], "x-real-ip": "1.2.3.4"})
    assert _get_user_or_ip(req) == f"user:{prof['id']}"


def test_login_rate_limited_per_ip(client, monkeypatch):
    async def fake_post(self, url, **kw):
        return httpx.Response(400, json={"error_description": "Invalid login credentials"},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    body = {"email": "a@b.co", "password": "wrongpass1"}
    ip1 = {"X-Real-IP": "9.9.9.9", "Authorization": "Bearer random"}
    codes = [client.post("/auth/login", json=body, headers=ip1).status_code for _ in range(11)]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429
    # another IP is unaffected
    assert client.post("/auth/login", json=body, headers={"X-Real-IP": "8.8.8.8"}).status_code == 401


def test_default_limit_applies_to_router_endpoints(client, make_company, make_user, monkeypatch):
    """Regression (PR #17): default limit must reach included-router endpoints.

    Uses 5/minute instead of the real 200/minute so the test stays well inside
    one fixed window (200 requests can straddle a minute boundary)."""
    monkeypatch.setattr(limiter, "_default_limits", Limiter(key_func=lambda: "x", default_limits=["5/minute"])._default_limits)
    co = make_company()
    _, h = make_user(co)
    codes = [client.get("/auth/me", headers=h).status_code for _ in range(6)]
    assert codes == [200] * 5 + [429]


# ── superadmin ──────────────────────────────────────────────────────────────
def test_superadmin_requires_key(client):
    assert client.get("/superadmin/stats").status_code == 403
    assert client.get("/superadmin/stats", headers={"X-Superadmin-Key": "wrong"}).status_code == 403
    assert client.get("/superadmin/stats", headers={"X-Superadmin-Key": "test-superadmin-key"}).status_code == 200


def test_superadmin_bruteforce_locked(client):
    h = {"X-Superadmin-Key": "wrong", "X-Real-IP": "7.7.7.7"}
    codes = [client.get("/superadmin/stats", headers=h).status_code for _ in range(11)]
    assert codes[:10] == [403] * 10 and codes[10] == 429
    # even the right key is refused from a locked IP
    h["X-Superadmin-Key"] = "test-superadmin-key"
    assert client.get("/superadmin/stats", headers=h).status_code == 429


def test_superadmin_approve_company_audited(client, fake, make_company):
    co = make_company(is_approved=False)
    r = client.patch(f"/superadmin/companies/{co['id']}/approve",
                     headers={"X-Superadmin-Key": "test-superadmin-key"})
    assert r.status_code == 200, r.text
    assert fake.rows("companies", id=co["id"])[0]["is_approved"] is True
    assert fake.rows("audit_log", entity_id=co["id"])


def test_superadmin_approve_unknown_company_404(client):
    r = client.patch("/superadmin/companies/00000000-0000-0000-0000-000000000000/approve",
                     headers={"X-Superadmin-Key": "test-superadmin-key"})
    assert r.status_code == 404


# ── CORS ────────────────────────────────────────────────────────────────────
def _preflight(client, origin):
    return client.options("/health", headers={
        "Origin": origin, "Access-Control-Request-Method": "GET"})


def test_cors_allows_own_domains(client):
    for o in ["https://donkap.space", "https://admin.donkap.space",
              "https://umkm-attendance-git-x-riza-gumelars-projects.vercel.app"]:
        assert _preflight(client, o).headers.get("access-control-allow-origin") == o


def test_cors_blocks_foreign_vercel(client):
    for o in ["https://evil.vercel.app", "https://evil-riza-gumelars-projects.vercel.app.evil.com"]:
        assert _preflight(client, o).headers.get("access-control-allow-origin") is None
