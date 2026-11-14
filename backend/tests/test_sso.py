"""SSO login (/auth/sso/session): login-only, never auto-provisions accounts."""
import uuid


def _sso_user(fake, email, providers=("google",)):
    """Auth user as Supabase creates it after an OAuth sign-in — no profile."""
    uid = str(uuid.uuid4())
    token = f"tok-{uid}"
    fake.auth_users[uid] = {"email": email, "providers": list(providers)}
    fake.tokens[token] = uid
    return uid, {"Authorization": f"Bearer {token}"}


def test_sso_existing_account_returns_profile(client, fake, make_company, make_user):
    co = make_company()
    prof, h = make_user(co)
    # Supabase linked the Google identity to the existing user (same user_id)
    fake.auth_users[prof["id"]]["providers"] = ["email", "google"]
    r = client.post("/auth/sso/session", headers=h)
    assert r.status_code == 200
    assert r.json()["id"] == prof["id"]
    assert r.json()["companies"]["id"] == co["id"]


def test_sso_unknown_email_rejected_and_cleaned_up(client, fake):
    uid, h = _sso_user(fake, "stranger@gmail.com")
    r = client.post("/auth/sso/session", headers=h)
    assert r.status_code == 403
    assert r.json()["detail"] == "sso_not_registered"
    assert uid not in fake.auth_users          # stray SSO user deleted
    assert not fake.rows("profiles", id=uid)   # and no profile auto-created
    # The token no longer works anywhere
    assert client.get("/auth/me", headers=h).status_code == 401


def test_sso_does_not_delete_unfinished_email_signup(client, fake):
    """A user with an email identity but no profile (register OTP not finished)
    must survive — it belongs to Donkap's own sign-up flow."""
    uid, h = _sso_user(fake, "halfway@test.local", providers=("email", "google"))
    r = client.post("/auth/sso/session", headers=h)
    assert r.status_code == 403
    assert uid in fake.auth_users


def test_sso_deactivated_user_blocked(client, fake, make_company, make_user):
    co = make_company()
    _, h = make_user(co, is_active=False)
    r = client.post("/auth/sso/session", headers=h)
    assert r.status_code == 403
    assert r.json()["detail"] == "Akun Anda telah dinonaktifkan"


def test_sso_pending_company_blocked(client, make_company, make_user):
    co = make_company(is_approved=False)
    _, h = make_user(co)
    r = client.post("/auth/sso/session", headers=h)
    assert r.status_code == 403
    assert r.json()["detail"] == "pending_approval"


def test_sso_demo_account_blocked(client, fake, make_company, make_user):
    co = make_company()
    prof, h = make_user(co)
    fake.auth_users[prof["id"]]["email"] = "demo.admin@donkap.space"
    r = client.post("/auth/sso/session", headers=h)
    assert r.status_code == 403


def test_sso_requires_token(client):
    assert client.post("/auth/sso/session").status_code in (401, 403)
