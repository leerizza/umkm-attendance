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
    for company in data:
        p = (
            supabase.table("profiles")
            .select("id, full_name, is_active")
            .eq("company_id", company["id"])
            .execute()
        )
        company["user_count"] = len(p.data or [])
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
            .single()
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

    status = "approved" if approved else "rejected"
    return {"message": f"Company {status}", "company_id": company_id}


@router.get("/analytics", dependencies=[Depends(require_superadmin)])
async def get_analytics():
    """Return event counts by type, split by today / 7d / 30d / all-time."""
    now = datetime.now(timezone.utc)
    today     = now.date().isoformat()
    week_ago  = (now - timedelta(days=7)).date().isoformat()
    month_ago = (now - timedelta(days=30)).date().isoformat()

    res = supabase.table("analytics_events").select("event_type, source, created_at").execute()
    events = res.data or []

    def count(etype=None, since=None, source=None):
        return sum(
            1 for e in events
            if (etype  is None or e["event_type"] == etype)
            and (since  is None or e["created_at"][:10] >= since)
            and (source is None or e["source"] == source)
        )

    return {
        "page_views": {
            "today":    count("page_view", today),
            "last_7d":  count("page_view", week_ago),
            "last_30d": count("page_view", month_ago),
            "total":    count("page_view"),
            "demo":     count("page_view", source="demo"),
        },
        "demo_logins": {
            "today":    count("demo_login", today),
            "last_7d":  count("demo_login", week_ago),
            "last_30d": count("demo_login", month_ago),
            "total":    count("demo_login"),
        },
        "registrations": {
            "company": {
                "today":    count("register_company", today),
                "last_7d":  count("register_company", week_ago),
                "last_30d": count("register_company", month_ago),
                "total":    count("register_company"),
            },
            "employee": {
                "today":    count("register_employee", today),
                "last_7d":  count("register_employee", week_ago),
                "last_30d": count("register_employee", month_ago),
                "total":    count("register_employee"),
            },
        },
    }
