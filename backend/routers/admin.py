import csv
import io
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from utils.auth import require_admin
from db import supabase


class CompanyUpdateRequest(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_meters: Optional[int] = None
    work_start: Optional[str] = None  # "HH:MM"
    work_end: Optional[str] = None    # "HH:MM"

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
async def get_stats(admin: dict = Depends(require_admin)):
    """Dashboard stats for today."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    today = datetime.now(ZoneInfo("Asia/Jakarta")).date().isoformat()
    company_id = admin["company_id"]

    # Total employees
    emp_res = supabase.table("profiles").select("id", count="exact").eq("company_id", company_id).eq("is_active", True).execute()

    # Today attendance
    att_res = supabase.table("attendance").select("id,status", count="exact").eq("company_id", company_id).eq("date", today).execute()

    # Pending leaves
    leave_res = supabase.table("leave_requests").select("id", count="exact").eq("company_id", company_id).eq("status", "pending").execute()

    # Pending overtime
    ot_res = supabase.table("overtime_requests").select("id", count="exact").eq("company_id", company_id).eq("status", "pending").execute()

    clocked_in = sum(1 for r in (att_res.data or []) if r.get("clock_in") or r.get("status") == "present")

    return {
        "total_employees": emp_res.count or 0,
        "present_today": att_res.count or 0,
        "pending_leaves": leave_res.count or 0,
        "pending_overtime": ot_res.count or 0,
    }


@router.get("/attendance")
async def admin_attendance(
    page: int = 1,
    per_page: int = 20,
    date_filter: str = None,
    admin: dict = Depends(require_admin),
):
    offset = (page - 1) * per_page
    q = (
        supabase.table("attendance")
        .select("*, profiles(full_name,position)", count="exact")
        .eq("company_id", admin["company_id"])
        .order("date", desc=True)
        .order("clock_in", desc=True)
    )
    if date_filter:
        q = q.eq("date", date_filter)

    res = q.range(offset, offset + per_page - 1).execute()
    return {"data": res.data, "total": res.count, "page": page, "per_page": per_page}


@router.get("/leave")
async def admin_leave(
    page: int = 1,
    per_page: int = 20,
    status_filter: str = None,
    admin: dict = Depends(require_admin),
):
    offset = (page - 1) * per_page
    q = (
        supabase.table("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name,position)", count="exact")
        .eq("company_id", admin["company_id"])
        .order("created_at", desc=True)
    )
    if status_filter:
        q = q.eq("status", status_filter)

    res = q.range(offset, offset + per_page - 1).execute()
    return {"data": res.data, "total": res.count, "page": page, "per_page": per_page}


@router.get("/overtime")
async def admin_overtime(
    page: int = 1,
    per_page: int = 20,
    status_filter: str = None,
    admin: dict = Depends(require_admin),
):
    offset = (page - 1) * per_page
    q = (
        supabase.table("overtime_requests")
        .select("*, profiles!overtime_requests_user_id_fkey(full_name,position)", count="exact")
        .eq("company_id", admin["company_id"])
        .order("created_at", desc=True)
    )
    if status_filter:
        q = q.eq("status", status_filter)

    res = q.range(offset, offset + per_page - 1).execute()
    return {"data": res.data, "total": res.count, "page": page, "per_page": per_page}


@router.get("/employees")
async def admin_employees(
    page: int = 1,
    per_page: int = 20,
    admin: dict = Depends(require_admin),
):
    offset = (page - 1) * per_page
    res = (
        supabase.table("profiles")
        .select("*", count="exact")
        .eq("company_id", admin["company_id"])
        .order("full_name")
        .range(offset, offset + per_page - 1)
        .execute()
    )
    return {"data": res.data, "total": res.count, "page": page, "per_page": per_page}


@router.get("/company")
async def get_company(admin: dict = Depends(require_admin)):
    res = (
        supabase.table("companies")
        .select("*")
        .eq("id", admin["company_id"])
        .single()
        .execute()
    )
    return res.data


# @router.patch("/company")
# async def update_company(
#     body: CompanyUpdateRequest,
#     admin: dict = Depends(require_admin),
# ):
#     updates = {k: v for k, v in body.model_dump().items() if v is not None}
#     if not updates:
#         raise HTTPException(400, "No fields to update")

#     res = (
#         supabase.table("companies")
#         .update(updates)
#         .eq("id", admin["company_id"])
#         .execute()
#     )
#     return {"message": "Company settings updated", "data": res.data[0]}

@router.patch("/company")
async def update_company(
    body: CompanyUpdateRequest,
    admin: dict = Depends(require_admin),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    # Update dulu
    supabase.table("companies") \
        .update(updates) \
        .eq("id", admin["company_id"]) \
        .execute()

    # Fetch ulang data terbaru
    res = supabase.table("companies") \
        .select("*") \
        .eq("id", admin["company_id"]) \
        .single() \
        .execute()

    if not res.data:
        raise HTTPException(404, "Company not found")

    return {"message": "Company settings updated", "data": res.data}


@router.get("/attendance/export")
async def export_attendance_csv(
    date_from: str = None,
    date_to: str = None,
    admin: dict = Depends(require_admin),
):
    """Export attendance data as CSV. Defaults to current month."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    import calendar

    if not date_from or not date_to:
        today = datetime.now(ZoneInfo("Asia/Jakarta")).date()
        date_from = today.replace(day=1).isoformat()
        date_to = today.replace(
            day=calendar.monthrange(today.year, today.month)[1]
        ).isoformat()

    res = (
        supabase.table("attendance")
        .select("date, clock_in, clock_out, clock_in_distance_m, status, notes, profiles(full_name, position)")
        .eq("company_id", admin["company_id"])
        .gte("date", date_from)
        .lte("date", date_to)
        .order("date", desc=False)
        .order("clock_in", desc=False)
        .execute()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Nama", "Jabatan", "Tanggal", "Jam Masuk", "Jam Keluar", "Jarak (m)", "Status", "Catatan"])

    for row in (res.data or []):
        profile = row.get("profiles") or {}
        clock_in = row.get("clock_in", "")
        clock_out = row.get("clock_out", "")

        # Format timestamps to local time string HH:MM
        def fmt(ts):
            if not ts:
                return ""
            from datetime import datetime, timezone
            from zoneinfo import ZoneInfo
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                return dt.astimezone(ZoneInfo("Asia/Jakarta")).strftime("%H:%M")
            except Exception:
                return ts

        writer.writerow([
            profile.get("full_name", ""),
            profile.get("position", ""),
            row.get("date", ""),
            fmt(clock_in),
            fmt(clock_out),
            row.get("clock_in_distance_m", ""),
            row.get("status", ""),
            row.get("notes", ""),
        ])

    output.seek(0)
    filename = f"absensi_{date_from}_{date_to}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.patch("/employees/{user_id}/role")
async def update_employee_role(
    user_id: str,
    role: str,
    admin: dict = Depends(require_admin),
):
    if role not in ("employee", "admin"):
        raise HTTPException(400, "role must be 'employee' or 'admin'")

    try:
        emp = supabase.table("profiles").select("company_id").eq("id", user_id).single().execute()
    except Exception:
        raise HTTPException(404, "Employee not found")
    if not emp.data or emp.data["company_id"] != admin["company_id"]:
        raise HTTPException(404, "Employee not found")

    supabase.table("profiles").update({"role": role}).eq("id", user_id).execute()
    return {"message": f"Role updated to {role}"}


@router.patch("/employees/{user_id}/active")
async def toggle_employee_active(
    user_id: str,
    is_active: bool,
    admin: dict = Depends(require_admin),
):
    try:
        emp = supabase.table("profiles").select("company_id,role").eq("id", user_id).single().execute()
    except Exception:
        raise HTTPException(404, "Employee not found")
    if not emp.data or emp.data["company_id"] != admin["company_id"]:
        raise HTTPException(404, "Employee not found")
    if user_id == admin["id"]:
        raise HTTPException(400, "Cannot deactivate yourself")

    supabase.table("profiles").update({"is_active": is_active}).eq("id", user_id).execute()
    return {"message": "activated" if is_active else "deactivated"}
