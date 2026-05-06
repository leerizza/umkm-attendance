from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from utils.auth import require_superadmin
from db import supabase


class CompanyCreateRequest(BaseModel):
    name: str
    code: str
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_meters: int = 100
    work_start: str = "08:00"
    work_end: str = "17:00"


class CompanyUpdateRequest(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_meters: Optional[int] = None
    work_start: Optional[str] = None
    work_end: Optional[str] = None


router = APIRouter(prefix="/superadmin", tags=["superadmin"])


@router.get("/companies")
async def list_companies(
    page: int = 1,
    per_page: int = 20,
    _: dict = Depends(require_superadmin),
):
    offset = (page - 1) * per_page
    res = (
        supabase.table("companies")
        .select("*", count="exact")
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )

    companies = res.data or []

    # Count employees per company with a single grouped query
    if companies:
        company_ids = [c["id"] for c in companies]
        # Fetch only company_id (no row data) to count per company
        emp_res = (
            supabase.table("profiles")
            .select("company_id")
            .in_("company_id", company_ids)
            .execute()
        )
        counts: dict[str, int] = {}
        for row in (emp_res.data or []):
            cid = row["company_id"]
            counts[cid] = counts.get(cid, 0) + 1

        for c in companies:
            c["employee_count"] = counts.get(c["id"], 0)

    return {"data": companies, "total": res.count, "page": page, "per_page": per_page}


@router.post("/companies")
async def create_company(
    body: CompanyCreateRequest,
    _: dict = Depends(require_superadmin),
):
    # Ensure code is unique
    existing = (
        supabase.table("companies")
        .select("id")
        .eq("code", body.code.upper())
        .execute()
    )
    if existing.data:
        raise HTTPException(400, "Company code already exists")

    payload = body.model_dump()
    payload["code"] = payload["code"].upper()

    supabase.table("companies").insert(payload).execute()
    return {"message": "Company created"}


@router.get("/companies/{company_id}")
async def get_company(
    company_id: str,
    _: dict = Depends(require_superadmin),
):
    try:
        res = (
            supabase.table("companies")
            .select("*")
            .eq("id", company_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(404, "Company not found")
    if not res.data:
        raise HTTPException(404, "Company not found")
    return res.data


@router.patch("/companies/{company_id}")
async def update_company(
    company_id: str,
    body: CompanyUpdateRequest,
    _: dict = Depends(require_superadmin),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    supabase.table("companies").update(updates).eq("id", company_id).execute()

    try:
        res = (
            supabase.table("companies")
            .select("*")
            .eq("id", company_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(404, "Company not found")
    if not res.data:
        raise HTTPException(404, "Company not found")
    return {"message": "Company updated", "data": res.data}


@router.get("/companies/{company_id}/employees")
async def list_company_employees(
    company_id: str,
    page: int = 1,
    per_page: int = 50,
    _: dict = Depends(require_superadmin),
):
    offset = (page - 1) * per_page
    res = (
        supabase.table("profiles")
        .select("id, full_name, position, role, is_active, created_at", count="exact")
        .eq("company_id", company_id)
        .order("full_name")
        .range(offset, offset + per_page - 1)
        .execute()
    )
    return {"data": res.data, "total": res.count, "page": page, "per_page": per_page}


@router.patch("/companies/{company_id}/employees/{user_id}/role")
async def update_employee_role(
    company_id: str,
    user_id: str,
    role: str,
    _: dict = Depends(require_superadmin),
):
    if role not in ("employee", "admin", "superadmin"):
        raise HTTPException(400, "Invalid role")

    try:
        emp = (
            supabase.table("profiles")
            .select("company_id")
            .eq("id", user_id)
            .eq("company_id", company_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(404, "Employee not found in this company")
    if not emp.data:
        raise HTTPException(404, "Employee not found in this company")

    supabase.table("profiles").update({"role": role}).eq("id", user_id).execute()
    return {"message": f"Role updated to {role}"}


@router.get("/stats")
async def superadmin_stats(_: dict = Depends(require_superadmin)):
    companies_res = supabase.table("companies").select("id", count="exact").execute()
    employees_res = supabase.table("profiles").select("id", count="exact").execute()
    return {
        "total_companies": companies_res.count or 0,
        "total_employees": employees_res.count or 0,
    }
