"""Test setup: swap the real Supabase client for an in-memory fake.

Must run before any app module is imported, because routers bind
``from db import supabase`` at import time.
"""
import os
import sys
import uuid

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SUPERADMIN_KEY", "test-superadmin-key")
os.environ["SENTRY_DSN"] = ""
os.environ["RESEND_API_KEY"] = ""

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

import db  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

FAKE = FakeSupabase()
db.supabase = FAKE

import main  # noqa: E402
import utils.auth as auth_utils  # noqa: E402
from limiter import limiter  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(autouse=True)
def fake():
    FAKE.reset()
    auth_utils._auth_cache.clear()
    auth_utils._profile_cache.clear()
    auth_utils._email_cache.clear()
    limiter.reset()
    yield FAKE


@pytest.fixture
def client():
    # Not used as a context manager → lifespan (sick-note cleanup loop) is not started.
    return TestClient(main.app)


# Jakarta office used by the GPS tests
OFFICE = {"lat": -6.2000, "lng": 106.8166}


@pytest.fixture
def make_company(fake):
    def _make(**over):
        row = {
            "name": "PT Uji",
            "code": f"UJI{uuid.uuid4().hex[:4].upper()}",
            "lat": OFFICE["lat"],
            "lng": OFFICE["lng"],
            "radius_meters": 100,
            "work_start": "08:00",
            "work_end": "17:00",
            "is_approved": True,
            "multi_location": False,
        }
        row.update(over)
        return fake.add("companies", **row)
    return _make


@pytest.fixture
def make_user(fake):
    """Create auth user + profile; returns (profile_row, auth_headers)."""
    def _make(company: dict, role: str = "employee", **over):
        uid = str(uuid.uuid4())
        email = f"{uid[:8]}@test.local"
        token = f"tok-{uid}"
        fake.auth_users[uid] = {"email": email}
        fake.tokens[token] = uid
        prof = {
            "id": uid,
            "company_id": company["id"],
            "role": role,
            "full_name": f"User {uid[:4]}",
            "is_active": True,
        }
        prof.update(over)
        fake.add("profiles", **prof)
        return prof, {"Authorization": f"Bearer {token}"}
    return _make
