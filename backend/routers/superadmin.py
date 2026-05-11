from fastapi import APIRouter, Depends, HTTPException, Header
from typing import Optional
from config import settings
from db import supabase
from utils.email import send_company_approved_email

router = APIRouter(prefix="/superadmin", tags=["superadmin"])


def require_superadmin(x_superadmin_key: Optional[str] = Header(None)):
    if not settings.superadmin_key or x_superadmin_key != settings.superadmin_key:
        raise HTTPException(403, "Invalid or missing superadmin key")


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

    # Get owner profile + email
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
    except Exception:
        pass

    status = "approved" if approved else "rejected"
    return {"message": f"Company {status}", "company_id": company_id}
