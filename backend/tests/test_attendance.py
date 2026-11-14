"""Clock-in GPS validation and attendance state machine."""
from tests.conftest import OFFICE

NEAR = {"lat": OFFICE["lat"] + 0.0002, "lng": OFFICE["lng"]}   # ~22 m
FAR = {"lat": OFFICE["lat"] + 0.01, "lng": OFFICE["lng"]}      # ~1.1 km


def test_clock_in_inside_radius(client, fake, make_company, make_user):
    co = make_company()
    prof, h = make_user(co)
    r = client.post("/attendance/clock-in", json=NEAR, headers=h)
    assert r.status_code == 200, r.text
    assert 0 < r.json()["distance_m"] < 100
    rows = fake.rows("attendance", user_id=prof["id"])
    assert len(rows) == 1 and rows[0]["company_id"] == co["id"]


def test_clock_in_outside_radius_rejected(client, fake, make_company, make_user):
    co = make_company()
    prof, h = make_user(co)
    r = client.post("/attendance/clock-in", json=FAR, headers=h)
    assert r.status_code == 400
    assert fake.rows("attendance", user_id=prof["id"]) == []


def test_double_clock_in_rejected(client, make_company, make_user):
    co = make_company()
    _, h = make_user(co)
    assert client.post("/attendance/clock-in", json=NEAR, headers=h).status_code == 200
    assert client.post("/attendance/clock-in", json=NEAR, headers=h).status_code == 400


def test_clock_in_invalid_coordinates(client, make_company, make_user):
    co = make_company()
    _, h = make_user(co)
    r = client.post("/attendance/clock-in", json={"lat": 123, "lng": 0}, headers=h)
    assert r.status_code == 422


def test_multi_location_requires_assignment(client, make_company, make_user):
    co = make_company(multi_location=True)
    _, h = make_user(co)
    r = client.post("/attendance/clock-in", json=NEAR, headers=h)
    assert r.status_code == 400


def test_multi_location_assigned(client, fake, make_company, make_user):
    co = make_company(multi_location=True)
    prof, h = make_user(co)
    loc = fake.add("locations", company_id=co["id"], name="Gudang", lat=FAR["lat"], lng=FAR["lng"],
                   radius_meters=50, is_active=True)
    fake.add("employee_locations", user_id=prof["id"], location_id=loc["id"])
    # at the office (not assigned) → rejected; at the assigned location → ok
    assert client.post("/attendance/clock-in", json=NEAR, headers=h).status_code == 400
    r = client.post("/attendance/clock-in", json=FAR, headers=h)
    assert r.status_code == 200
    assert r.json()["location_id"] == loc["id"]


def test_clock_out_flow(client, fake, make_company, make_user):
    co = make_company()
    prof, h = make_user(co)
    assert client.post("/attendance/clock-out", json=NEAR, headers=h).status_code == 400  # not clocked in
    assert client.post("/attendance/clock-in", json=NEAR, headers=h).status_code == 200
    r = client.post("/attendance/clock-out", json=NEAR, headers=h)
    assert r.status_code == 200, r.text
    assert fake.rows("attendance", user_id=prof["id"])[0].get("clock_out")


def test_today_only_own_record(client, fake, make_company, make_user):
    co = make_company()
    _, h1 = make_user(co)
    _, h2 = make_user(co)
    assert client.post("/attendance/clock-in", json=NEAR, headers=h1).status_code == 200
    r = client.get("/attendance/today", headers=h2)
    assert r.status_code == 200
    assert r.json()["record"] is None  # user 2 has no record today
