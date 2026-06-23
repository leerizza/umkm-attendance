import asyncio
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Header
from typing import Optional
from config import settings
from db import supabase
from utils.email import send_company_approved_email

router = APIRouter(prefix="/superadmin", tags=["superadmin"])
_log = logging.getLogger(__name__)


def require_superadmin(x_superadmin_key: Optional[str] = Header(None)):
    if not settings.superadmin_key or x_superadmin_key != settings.superadmin_key:
        raise HTTPException(403, "Invalid or missing superadmin key")


@router.get("/stats", dependencies=[Depends(require_superadmin)])
async def get_stats():
    companies_res = supabase.table("companies").select("id, is_approved").execute()
    companies = companies_res.data or []
    total_companies  = len(companies)
    approved_companies = sum(1 for c in companies if c.get("is_approved"))
    pending_companies  = total_companies - approved_companies

    profiles_res = supabase.table("profiles").select("role, is_active").execute()
    profiles = profiles_res.data or []
    total_admins     = sum(1 for p in profiles if p.get("role") == "admin")
    total_employees  = sum(1 for p in profiles if p.get("role") == "employee")
    active_accounts  = sum(1 for p in profiles if p.get("is_active") is not False)

    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    att_res = (
        supabase.table("attendance")
        .select("user_id")
        .gte("date", cutoff)
        .execute()
    )
    recently_active = len({r["user_id"] for r in (att_res.data or [])})

    return {
        "companies": {
            "total": total_companies,
            "approved": approved_companies,
            "pending": pending_companies,
        },
        "users": {
            "total": len(profiles),
            "admins": total_admins,
            "employees": total_employees,
            "active_accounts": active_accounts,
            "recently_active_30d": recently_active,
        },
    }


@router.get("/companies/all", dependencies=[Depends(require_superadmin)])
async def list_all_companies():
    res = (
        supabase.table("companies")
        .select("id, name, code, is_approved, created_at")
        .order("created_at", desc=True)
        .execute()
    )
    data = res.data or []

    # Bulk user counts — single query instead of N queries
    profiles_res = supabase.table("profiles").select("company_id").execute()
    user_counts: dict = {}
    for p in (profiles_res.data or []):
        cid = p.get("company_id")
        if cid:
            user_counts[cid] = user_counts.get(cid, 0) + 1

    # Last attendance date per company (last 90 days)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).date().isoformat()
    att_res = (
        supabase.table("attendance")
        .select("company_id, date")
        .gte("date", cutoff)
        .execute()
    )
    last_activity: dict = {}
    for row in (att_res.data or []):
        cid, d = row.get("company_id"), row.get("date")
        if cid and d and (cid not in last_activity or d > last_activity[cid]):
            last_activity[cid] = d

    for company in data:
        company["user_count"]    = user_counts.get(company["id"], 0)
        company["last_activity"] = last_activity.get(company["id"])

    return {"data": data, "total": len(data)}


@router.get("/companies/pending", dependencies=[Depends(require_superadmin)])
async def list_pending_companies():
    res = (
        supabase.table("companies")
        .select("id, name, code, created_at")
        .eq("is_approved", False)
        .order("created_at", desc=True)
        .execute()
    )
    return {"data": res.data, "total": len(res.data)}


@router.patch("/companies/{company_id}/approve", dependencies=[Depends(require_superadmin)])
async def approve_company(company_id: str, approved: bool = True):
    try:
        company = supabase.table("companies").select("id, name, is_approved").eq("id", company_id).single().execute()
    except Exception:
        raise HTTPException(404, "Company not found")
    if not company.data:
        raise HTTPException(404, "Company not found")

    supabase.table("companies").update({"is_approved": approved}).eq("id", company_id).execute()

    try:
        profile = (
            supabase.table("profiles")
            .select("full_name, id")
            .eq("company_id", company_id)
            .eq("role", "admin")
            .maybe_single()
            .execute()
        )
        if profile.data:
            from utils.auth import _get_auth_email
            owner_email = await _get_auth_email(profile.data["id"])
            if owner_email:
                await send_company_approved_email(
                    owner_email=owner_email,
                    owner_name=profile.data["full_name"],
                    company_name=company.data["name"],
                    approved=approved,
                )
    except Exception as e:
        _log.error("Failed to send approval email: %s", e)

    try:
        supabase.table("audit_log").insert({
            "action": "approve" if approved else "reject",
            "entity_type": "company",
            "entity_id": company_id,
            "entity_name": company.data["name"],
        }).execute()
    except Exception as e:
        _log.error("Failed to write audit log: %s", e)

    status = "approved" if approved else "rejected"
    return {"message": f"Company {status}", "company_id": company_id}


@router.get("/analytics", dependencies=[Depends(require_superadmin)])
async def get_analytics():
    """Return event counts by type, split by today / 7d / 30d / all-time."""
    now = datetime.now(timezone.utc)
    today     = now.date().isoformat()
    week_ago  = (now - timedelta(days=7)).date().isoformat()
    month_ago = (now - timedelta(days=30)).date().isoformat()

    # Only fetch last 30 days for windowed + source breakdowns — avoids full table scan
    res = (
        supabase.table("analytics_events")
        .select("event_type, source, created_at")
        .gte("created_at", month_ago + "T00:00:00+00:00")
        .execute()
    )
    events = res.data or []

    def count(etype=None, since=None, source=None):
        return sum(
            1 for e in events
            if (etype  is None or e["event_type"] == etype)
            and (since  is None or e["created_at"][:10] >= since)
            and (source is None or e["source"] == source)
        )

    def count_sources(etype, sources):
        return sum(1 for e in events if e["event_type"] == etype and e["source"] in sources)

    def total(etype):
        r = supabase.table("analytics_events").select("id", count="exact").eq("event_type", etype).execute()
        return r.count or 0

    return {
        "page_views": {
            "today":    count("page_view", today),
            "last_7d":  count("page_view", week_ago),
            "last_30d": count("page_view"),
            "total":    total("page_view"),
            "demo":     count("page_view", source="demo"),
            "by_source": {
                "landing": count_sources("page_view", {"landing"}),
                "demo":    count_sources("page_view", {"demo"}),
                "app":     count_sources("page_view", {"app", "main"}),
            },
        },
        "demo_logins": {
            "today":    count("demo_login", today),
            "last_7d":  count("demo_login", week_ago),
            "last_30d": count("demo_login"),
            "total":    total("demo_login"),
        },
        "registrations": {
            "company": {
                "today":    count("register_company", today),
                "last_7d":  count("register_company", week_ago),
                "last_30d": count("register_company"),
                "total":    total("register_company"),
            },
            "employee": {
                "today":    count("register_employee", today),
                "last_7d":  count("register_employee", week_ago),
                "last_30d": count("register_employee"),
                "total":    total("register_employee"),
            },
        },
    }


@router.get("/analytics/range", dependencies=[Depends(require_superadmin)])
async def get_analytics_range(from_date: str, to_date: str):
    """Return analytics totals + daily trend for a custom date range."""
    try:
        from_d = datetime.fromisoformat(from_date).date()
        to_d   = datetime.fromisoformat(to_date).date()
    except ValueError:
        raise HTTPException(400, "Gunakan format YYYY-MM-DD")
    if from_d > to_d:
        raise HTTPException(400, "from_date harus sebelum to_date")
    if (to_d - from_d).days > 365:
        raise HTTPException(400, "Range maksimal 365 hari")

    res = (
        supabase.table("analytics_events")
        .select("event_type, source, created_at")
        .gte("created_at", from_date + "T00:00:00+00:00")
        .lte("created_at", to_date   + "T23:59:59+00:00")
        .execute()
    )
    events = res.data or []

    def c(etype):
        return sum(1 for e in events if e["event_type"] == etype)

    def c_src(etype, sources):
        return sum(1 for e in events if e["event_type"] == etype and e["source"] in sources)

    cur, trend = from_d, []
    while cur <= to_d:
        iso = cur.isoformat()
        trend.append({
            "date": iso,
            "page_views":    sum(1 for e in events if e["event_type"] == "page_view"    and e["created_at"][:10] == iso),
            "demo_logins":   sum(1 for e in events if e["event_type"] == "demo_login"   and e["created_at"][:10] == iso),
            "registrations": sum(1 for e in events if e["event_type"] in ("register_company", "register_employee") and e["created_at"][:10] == iso),
        })
        cur += timedelta(days=1)

    return {
        "from": from_date, "to": to_date,
        "page_views": {
            "total": c("page_view"),
            "by_source": {
                "landing": c_src("page_view", {"landing"}),
                "demo":    c_src("page_view", {"demo"}),
                "app":     c_src("page_view", {"app", "main"}),
            },
        },
        "demo_logins":   {"total": c("demo_login")},
        "registrations": {
            "company":  {"total": c("register_company")},
            "employee": {"total": c("register_employee")},
        },
        "trend": trend,
    }


@router.get("/analytics/trend", dependencies=[Depends(require_superadmin)])
async def get_analytics_trend():
    """Daily event counts for the past 7 days (UTC) — used by the trend chart."""
    now = datetime.now(timezone.utc)
    days = [(now - timedelta(days=i)).date() for i in range(6, -1, -1)]
    cutoff = days[0].isoformat() + "T00:00:00+00:00"

    res = (
        supabase.table("analytics_events")
        .select("event_type, created_at")
        .gte("created_at", cutoff)
        .execute()
    )
    events = res.data or []

    result = []
    for day in days:
        iso = day.isoformat()
        result.append({
            "date": iso,
            "page_views":    sum(1 for e in events if e["event_type"] == "page_view"    and e["created_at"][:10] == iso),
            "demo_logins":   sum(1 for e in events if e["event_type"] == "demo_login"   and e["created_at"][:10] == iso),
            "registrations": sum(1 for e in events if e["event_type"] in ("register_company", "register_employee") and e["created_at"][:10] == iso),
        })
    return {"data": result}


@router.get("/audit-log", dependencies=[Depends(require_superadmin)])
async def get_audit_log():
    res = (
        supabase.table("audit_log")
        .select("id, action, entity_type, entity_name, created_at")
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return {"data": res.data or []}


@router.get("/companies/{company_id}/users", dependencies=[Depends(require_superadmin)])
async def get_company_users(company_id: str):
    """List all profiles for a given company, including auth email."""
    res = (
        supabase.table("profiles")
        .select("id, full_name, role, position, is_active, created_at")
        .eq("company_id", company_id)
        .order("role")
        .execute()
    )
    users = res.data or []

    if users:
        from utils.auth import _get_auth_email
        emails = await asyncio.gather(
            *[_get_auth_email(u["id"]) for u in users],
            return_exceptions=True,
        )
        for u, email in zip(users, emails):
            u["email"] = email if isinstance(email, str) else None

    return {"data": users}
