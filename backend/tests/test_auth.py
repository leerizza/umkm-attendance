"""Auth dependency, profile gating, auth cache, logout, refresh/login plumbing."""
import httpx
import pytest

import utils.auth as auth_utils


def test_me_requires_token(client):
    assert client.get("/auth/me").status_code in (401, 403)


def test_me_invalid_token(client):
    r = client.get("/auth/me", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


def test_me_ok(client, make_company, make_user):
    co = make_company()
    prof, h = make_user(co)
    r = client.get("/auth/me", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == prof["id"]
    assert body["companies"]["id"] == co["id"]


def test_deactivated_user_blocked(client, make_company, make_user):
    co = make_company()
    _, h = make_user(co, is_active=False)
    r = client.get("/auth/me", headers=h)
    assert r.status_code == 403
    assert r.json()["detail"] == "Akun Anda telah dinonaktifkan"


def test_pending_company_blocked(client, make_company, make_user):
    co = make_company(is_approved=False)
    _, h = make_user(co)
    r = client.get("/auth/me", headers=h)
    assert r.status_code == 403
    assert r.json()["detail"] == "pending_approval"


def test_employee_cannot_call_admin(client, make_company, make_user):
    co = make_company()
    _, h = make_user(co, role="employee")
    assert client.get("/admin/stats", headers=h).status_code == 403


def test_logout_evicts_token_from_cache(client, fake, make_company, make_user):
    co = make_company()
    _, h = make_user(co)
    token = h["Authorization"].split()[1]
    assert client.get("/auth/me", headers=h).status_code == 200
    assert auth_utils._get_cached_user(token) is not None

    # Session revoked at Supabase (what supabase.auth.signOut() does) …
    fake.tokens.pop(token)
    # … but still cached by the backend until /auth/logout is called
    assert client.get("/auth/me", headers=h).status_code == 200
    assert client.post("/auth/logout", headers=h).status_code == 200
    assert client.get("/auth/me", headers=h).status_code == 401


def test_logout_without_token_is_ok(client):
    assert client.post("/auth/logout").status_code == 200


def test_refresh_does_not_touch_global_client(client, monkeypatch):
    """Regression (PR #16): /auth/refresh must call GoTrue over httpx, never
    supabase.auth.refresh_session() on the shared service-role client."""
    calls = []

    async def fake_post(self, url, **kw):
        calls.append(url)
        return httpx.Response(
            200,
            json={"access_token": "a", "refresh_token": "r", "expires_at": 1, "user": {"id": "u", "email": "e"}},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    r = client.post("/auth/refresh", json={"refresh_token": "x"})
    assert r.status_code == 200
    assert calls and calls[0].endswith("/auth/v1/token")


def test_refresh_invalid_returns_401(client, monkeypatch):
    async def fake_post(self, url, **kw):
        return httpx.Response(400, json={"error": "invalid_grant"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    assert client.post("/auth/refresh", json={"refresh_token": "x"}).status_code == 401


def test_login_wrong_password_401(client, monkeypatch):
    async def fake_post(self, url, **kw):
        return httpx.Response(400, json={"error_description": "Invalid login credentials"},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    r = client.post("/auth/login", json={"email": "a@b.co", "password": "wrongpass1"})
    assert r.status_code == 401
