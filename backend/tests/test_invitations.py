"""Admin invitations + joining a company via "Masuk dengan Google"."""
import uuid
from datetime import datetime, timedelta, timezone


def _sso_user(fake, email, providers=("google",), **extra):
    uid = str(uuid.uuid4())
    token = f"tok-{uid}"
    fake.auth_users[uid] = {"email": email, "providers": list(providers), **extra}
    fake.tokens[token] = uid
    return uid, {"Authorization": f"Bearer {token}"}


def _invite(client, h, *emails, **kw):
    return client.post("/admin/invitations", headers=h, json={"emails": list(emails), **kw})


# ── admin side ───────────────────────────────────────────────────────────────

def test_admin_can_invite_and_list(client, fake, make_company, make_user):
    co = make_company()
    _, h = make_user(co, role="admin")
    r = _invite(client, h, "Budi@Gmail.com ", "siti@gmail.com", "budi@gmail.com")
    assert r.status_code == 200
    assert sorted(i["email"] for i in r.json()["created"]) == ["budi@gmail.com", "siti@gmail.com"]
    rows = fake.rows("invitations", company_id=co["id"])
    assert len(rows) == 2 and all(x["status"] == "pending" for x in rows)

    listed = client.get("/admin/invitations", headers=h).json()["data"]
    assert {i["email"] for i in listed} == {"budi@gmail.com", "siti@gmail.com"}


def test_employee_cannot_invite(client, make_company, make_user):
    co = make_company()
    _, h = make_user(co, role="employee")
    assert _invite(client, h, "x@gmail.com").status_code == 403
    assert client.get("/admin/invitations", headers=h).status_code == 403


def test_demo_admin_cannot_invite(client, fake, make_company, make_user):
    co = make_company()
    prof, h = make_user(co, role="admin")
    fake.auth_users[prof["id"]]["email"] = "demo.admin@donkap.space"
    assert _invite(client, h, "victim@gmail.com").status_code == 403
    assert not fake.rows("invitations")


def test_invalid_email_rejected(client, make_company, make_user):
    co = make_company()
    _, h = make_user(co, role="admin")
    assert _invite(client, h, "bukan-email").status_code == 422
    assert _invite(client, h, "a@b.co", role="superadmin").status_code == 422


def test_email_with_open_invite_elsewhere_is_skipped(client, fake, make_company, make_user):
    co1, co2 = make_company(), make_company()
    _, h1 = make_user(co1, role="admin")
    _, h2 = make_user(co2, role="admin")
    _invite(client, h1, "budi@gmail.com")
    r = _invite(client, h2, "budi@gmail.com")
    assert r.json()["created"] == []
    assert r.json()["skipped"][0]["email"] == "budi@gmail.com"
    assert co1["name"] not in str(r.json())  # don't leak the other company


def test_expired_invite_elsewhere_is_released(client, fake, make_company, make_user):
    co1, co2 = make_company(), make_company()
    _, h1 = make_user(co1, role="admin")
    _, h2 = make_user(co2, role="admin")
    _invite(client, h1, "budi@gmail.com")
    old = fake.rows("invitations", company_id=co1["id"])[0]
    old["expires_at"] = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    r = _invite(client, h2, "budi@gmail.com")
    assert len(r.json()["created"]) == 1
    assert old["status"] == "revoked"


def test_reinvite_same_company_renews(client, fake, make_company, make_user):
    co = make_company()
    _, h = make_user(co, role="admin")
    _invite(client, h, "budi@gmail.com")
    r = _invite(client, h, "budi@gmail.com", role="admin")
    assert len(r.json()["renewed"]) == 1
    rows = fake.rows("invitations", company_id=co["id"])
    assert len(rows) == 1 and rows[0]["role"] == "admin"


def test_revoke_is_tenant_scoped(client, fake, make_company, make_user):
    co1, co2 = make_company(), make_company()
    _, h1 = make_user(co1, role="admin")
    _, h2 = make_user(co2, role="admin")
    inv = _invite(client, h1, "budi@gmail.com").json()["created"][0]
    assert client.delete(f"/admin/invitations/{inv['id']}", headers=h2).status_code == 404
    assert client.delete(f"/admin/invitations/{inv['id']}", headers=h1).status_code == 200
    assert fake.rows("invitations", id=inv["id"])[0]["status"] == "revoked"


# ── joining via Google ───────────────────────────────────────────────────────

def test_invited_google_user_gets_profile(client, fake, make_company, make_user):
    co = make_company()
    _, h = make_user(co, role="admin")
    _invite(client, h, "budi@gmail.com", position="Kasir")
    uid, hb = _sso_user(fake, "Budi@gmail.com", metadata={"full_name": "Budi Santoso"})

    r = client.post("/auth/sso/session", headers=hb)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == uid
    assert body["company_id"] == co["id"]
    assert body["role"] == "employee"
    assert body["full_name"] == "Budi Santoso"
    assert body["position"] == "Kasir"
    inv = fake.rows("invitations", email="budi@gmail.com")[0]
    assert inv["status"] == "accepted" and inv["accepted_by"] == uid
    # Next login: plain existing-account path, still works
    assert client.post("/auth/sso/session", headers=hb).status_code == 200


def test_invited_role_admin(client, fake, make_company, make_user):
    co = make_company()
    _, h = make_user(co, role="admin")
    _invite(client, h, "boss@gmail.com", role="admin")
    _, hb = _sso_user(fake, "boss@gmail.com")
    assert client.post("/auth/sso/session", headers=hb).json()["role"] == "admin"


def test_revoked_invite_cannot_be_used(client, fake, make_company, make_user):
    co = make_company()
    _, h = make_user(co, role="admin")
    inv = _invite(client, h, "budi@gmail.com").json()["created"][0]
    client.delete(f"/admin/invitations/{inv['id']}", headers=h)
    uid, hb = _sso_user(fake, "budi@gmail.com")
    r = client.post("/auth/sso/session", headers=hb)
    assert r.status_code == 403 and r.json()["detail"] == "sso_not_registered"
    assert uid not in fake.auth_users


def test_expired_invite_cannot_be_used(client, fake, make_company, make_user):
    co = make_company()
    _, h = make_user(co, role="admin")
    _invite(client, h, "budi@gmail.com")
    fake.rows("invitations", email="budi@gmail.com")[0]["expires_at"] = (
        datetime.now(timezone.utc) - timedelta(minutes=1)
    ).isoformat()
    _, hb = _sso_user(fake, "budi@gmail.com")
    assert client.post("/auth/sso/session", headers=hb).status_code == 403
    assert not fake.rows("profiles", company_id=co["id"], role="employee")


def test_unverified_email_cannot_accept(client, fake, make_company, make_user):
    co = make_company()
    _, h = make_user(co, role="admin")
    _invite(client, h, "budi@gmail.com")
    _, hb = _sso_user(fake, "budi@gmail.com", email_confirmed_at=None)
    assert client.post("/auth/sso/session", headers=hb).status_code == 403
    assert fake.rows("invitations", email="budi@gmail.com")[0]["status"] == "pending"


def test_invite_into_unapproved_company_is_gated(client, fake, make_company, make_user):
    co = make_company(is_approved=False)
    _, h_admin = make_user(co, role="admin")
    fake.add("invitations", company_id=co["id"], email="budi@gmail.com", role="employee",
             status="pending",
             expires_at=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat())
    _, hb = _sso_user(fake, "budi@gmail.com")
    r = client.post("/auth/sso/session", headers=hb)
    assert r.status_code == 403 and r.json()["detail"] == "pending_approval"
