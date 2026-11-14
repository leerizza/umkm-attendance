"""Multi-tenant isolation: an admin of company A must never act on company B."""
import pytest


@pytest.fixture
def two_companies(make_company, make_user):
    a, b = make_company(name="A"), make_company(name="B")
    admin_a, h_admin_a = make_user(a, role="admin")
    emp_a, h_emp_a = make_user(a)
    emp_b, h_emp_b = make_user(b)
    return dict(a=a, b=b, admin_a=admin_a, h_admin_a=h_admin_a,
                emp_a=emp_a, h_emp_a=h_emp_a, emp_b=emp_b, h_emp_b=h_emp_b)


def test_role_change_other_company_404(client, fake, two_companies):
    t = two_companies
    r = client.patch(f"/admin/employees/{t['emp_b']['id']}/role", params={"role": "admin"}, headers=t["h_admin_a"])
    assert r.status_code == 404
    assert fake.rows("profiles", id=t["emp_b"]["id"])[0]["role"] == "employee"


def test_role_change_same_company_audited(client, fake, two_companies):
    t = two_companies
    r = client.patch(f"/admin/employees/{t['emp_a']['id']}/role", params={"role": "admin"}, headers=t["h_admin_a"])
    assert r.status_code == 200
    assert fake.rows("profiles", id=t["emp_a"]["id"])[0]["role"] == "admin"
    log = fake.rows("audit_log", action="role_change")
    assert len(log) == 1
    assert log[0]["actor_id"] == t["admin_a"]["id"]
    assert log[0]["company_id"] == t["a"]["id"]
    assert log[0]["details"]["from"] == "employee" and log[0]["details"]["to"] == "admin"


def test_role_change_invalid_role(client, two_companies):
    t = two_companies
    r = client.patch(f"/admin/employees/{t['emp_a']['id']}/role", params={"role": "superadmin"}, headers=t["h_admin_a"])
    assert r.status_code == 400


def test_cannot_change_own_role(client, two_companies):
    t = two_companies
    r = client.patch(f"/admin/employees/{t['admin_a']['id']}/role", params={"role": "employee"}, headers=t["h_admin_a"])
    assert r.status_code == 400


def test_deactivate_other_company_404(client, fake, two_companies):
    t = two_companies
    r = client.patch(f"/admin/employees/{t['emp_b']['id']}/active", params={"is_active": False}, headers=t["h_admin_a"])
    assert r.status_code == 404
    assert fake.rows("profiles", id=t["emp_b"]["id"])[0]["is_active"] is True


def test_deactivate_takes_effect_immediately(client, two_companies):
    t = two_companies
    assert client.get("/auth/me", headers=t["h_emp_a"]).status_code == 200  # warm profile cache
    r = client.patch(f"/admin/employees/{t['emp_a']['id']}/active", params={"is_active": False}, headers=t["h_admin_a"])
    assert r.status_code == 200
    assert client.get("/auth/me", headers=t["h_emp_a"]).status_code == 403


def _leave(fake, prof, **over):
    row = dict(user_id=prof["id"], company_id=prof["company_id"], leave_type="annual",
               start_date="2026-12-01", end_date="2026-12-02", reason="x", status="pending")
    row.update(over)
    return fake.add("leave_requests", **row)


def test_approve_leave_other_company_403(client, fake, two_companies):
    t = two_companies
    lv = _leave(fake, t["emp_b"])
    r = client.post(f"/leave/{lv['id']}/approve", json={"status": "approved"}, headers=t["h_admin_a"])
    assert r.status_code == 403
    assert fake.rows("leave_requests", id=lv["id"])[0]["status"] == "pending"


def test_approve_own_leave_403(client, fake, two_companies):
    t = two_companies
    lv = _leave(fake, t["admin_a"])
    r = client.post(f"/leave/{lv['id']}/approve", json={"status": "approved"}, headers=t["h_admin_a"])
    assert r.status_code == 403


def test_approve_leave_same_company(client, fake, two_companies):
    t = two_companies
    lv = _leave(fake, t["emp_a"])
    r = client.post(f"/leave/{lv['id']}/approve", json={"status": "approved"}, headers=t["h_admin_a"])
    assert r.status_code == 200
    row = fake.rows("leave_requests", id=lv["id"])[0]
    assert row["status"] == "approved" and row["reviewed_by"] == t["admin_a"]["id"]


def test_employee_cannot_approve_leave(client, fake, two_companies):
    t = two_companies
    lv = _leave(fake, t["emp_a"])
    r = client.post(f"/leave/{lv['id']}/approve", json={"status": "approved"}, headers=t["h_emp_a"])
    assert r.status_code == 403


def test_admin_employee_list_scoped(client, two_companies):
    t = two_companies
    r = client.get("/admin/employees", headers=t["h_admin_a"])
    assert r.status_code == 200
    body = r.json()
    rows = body.get("data", body) if isinstance(body, dict) else body
    ids = {e["id"] for e in rows}
    assert t["emp_a"]["id"] in ids
    assert t["emp_b"]["id"] not in ids
