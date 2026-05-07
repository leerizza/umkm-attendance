import csv
import io
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from utils.auth import require_admin
from db import supabase

_TIME_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')


class CompanyUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    address: Optional[str] = Field(default=None, max_length=255)
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    radius_meters: Optional[int] = Field(default=None, ge=10, le=50000)
    work_start: Optional[str] = None  # "HH:MM"
    work_end: Optional[str] = None    # "HH:MM"

    @field_validator("work_start", "work_end")
    @classmethod
    def validate_time(cls, v):
        if v is not None and not _TIME_RE.match(v):
            raise ValueError("Format waktu harus HH:MM (contoh: 08:00)")
        return v


class AttendanceCorrectionRequest(BaseModel):
    clock_in: Optional[str] = None   # ISO datetime string, e.g. "2026-05-05T08:00:00"
    clock_out: Optional[str] = None  # ISO datetime string
    notes: Optional[str] = None

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

    # Pending corrections
    corr_res = supabase.table("attendance_corrections").select("id", count="exact").eq("company_id", company_id).eq("status", "pending").execute()

    return {
        "total_employees": emp_res.count or 0,
        "present_today": att_res.count or 0,
        "pending_leaves": leave_res.count or 0,
        "pending_overtime": ot_res.count or 0,
        "pending_corrections": corr_res.count or 0,
    }


@router.get("/attendance")
async def admin_attendance(
    page: int = 1,
    per_page: int = 10,
    date_from: str = None,
    date_to: str = None,
    admin: dict = Depends(require_admin),
):
    per_page = min(per_page, 100)
    offset = (page - 1) * per_page
    q = (
        supabase.table("attendance")
        .select("*, profiles(full_name,position)", count="exact")
        .eq("company_id", admin["company_id"])
        .order("date", desc=True)
        .order("clock_in", desc=True)
    )
    if date_from:
        q = q.gte("date", date_from)
    if date_to:
        q = q.lte("date", date_to)

    res = q.range(offset, offset + per_page - 1).execute()
    return {"data": res.data, "total": res.count, "page": page, "per_page": per_page}


@router.get("/leave")
async def admin_leave(
    page: int = 1,
    per_page: int = 10,
    status_filter: str = None,
    date_from: str = None,
    date_to: str = None,
    admin: dict = Depends(require_admin),
):
    per_page = min(per_page, 100)
    offset = (page - 1) * per_page
    q = (
        supabase.table("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name,position)", count="exact")
        .eq("company_id", admin["company_id"])
        .order("created_at", desc=True)
    )
    if status_filter:
        q = q.eq("status", status_filter)
    if date_from:
        q = q.gte("start_date", date_from)
    if date_to:
        q = q.lte("start_date", date_to)

    res = q.range(offset, offset + per_page - 1).execute()
    return {"data": res.data, "total": res.count, "page": page, "per_page": per_page}


@router.get("/overtime")
async def admin_overtime(
    page: int = 1,
    per_page: int = 10,
    status_filter: str = None,
    date_from: str = None,
    date_to: str = None,
    admin: dict = Depends(require_admin),
):
    per_page = min(per_page, 100)
    offset = (page - 1) * per_page
    q = (
        supabase.table("overtime_requests")
        .select("*, profiles!overtime_requests_user_id_fkey(full_name,position)", count="exact")
        .eq("company_id", admin["company_id"])
        .order("created_at", desc=True)
    )
    if status_filter:
        q = q.eq("status", status_filter)
    if date_from:
        q = q.gte("date", date_from)
    if date_to:
        q = q.lte("date", date_to)

    res = q.range(offset, offset + per_page - 1).execute()
    return {"data": res.data, "total": res.count, "page": page, "per_page": per_page}


@router.get("/employees")
async def admin_employees(
    page: int = 1,
    per_page: int = 10,
    search: str = None,
    is_active: bool = None,
    admin: dict = Depends(require_admin),
):
    per_page = min(per_page, 100)
    offset = (page - 1) * per_page
    q = (
        supabase.table("profiles")
        .select("*", count="exact")
        .eq("company_id", admin["company_id"])
        .order("full_name")
    )
    if search:
        q = q.ilike("full_name", f"%{search}%")
    if is_active is not None:
        q = q.eq("is_active", is_active)
    res = q.range(offset, offset + per_page - 1).execute()
    return {"data": res.data, "total": res.count, "page": page, "per_page": per_page}


@router.get("/employees/{user_id}/attendance")
async def employee_attendance_history(
    user_id: str,
    page: int = 1,
    per_page: int = 20,
    admin: dict = Depends(require_admin),
):
    try:
        emp = supabase.table("profiles").select("company_id, full_name").eq("id", user_id).single().execute()
    except Exception:
        raise HTTPException(404, "Karyawan tidak ditemukan")
    if not emp.data or emp.data["company_id"] != admin["company_id"]:
        raise HTTPException(404, "Karyawan tidak ditemukan")

    per_page = min(per_page, 100)
    offset = (page - 1) * per_page
    res = (
        supabase.table("attendance")
        .select("*", count="exact")
        .eq("user_id", user_id)
        .eq("company_id", admin["company_id"])
        .order("date", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )
    return {
        "employee": emp.data,
        "data": res.data,
        "total": res.count,
        "page": page,
        "per_page": per_page,
    }


@router.get("/company")
async def get_company(admin: dict = Depends(require_admin)):
    try:
        res = (
            supabase.table("companies")
            .select("*")
            .eq("id", admin["company_id"])
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(404, "Company not found")
    if not res.data:
        raise HTTPException(404, "Company not found")
    return res.data


@router.patch("/company")
async def update_company(
    body: CompanyUpdateRequest,
    admin: dict = Depends(require_admin),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    supabase.table("companies") \
        .update(updates) \
        .eq("id", admin["company_id"]) \
        .execute()

    try:
        res = supabase.table("companies") \
            .select("*") \
            .eq("id", admin["company_id"]) \
            .single() \
            .execute()
    except Exception:
        raise HTTPException(404, "Company not found")
    if not res.data:
        raise HTTPException(404, "Company not found")

    return {"message": "Company settings updated", "data": res.data}


@router.get("/report/monthly")
async def monthly_report(
    year: int = None,
    month: int = None,
    admin: dict = Depends(require_admin),
):
    """Per-employee monthly summary: hadir, terlambat, cuti, lembur, total jam kerja."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    import calendar

    today = datetime.now(ZoneInfo("Asia/Jakarta")).date()
    year  = year  or today.year
    month = month or today.month

    first_day = f"{year}-{month:02d}-01"
    last_day  = f"{year}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}"
    company_id = admin["company_id"]

    # All active employees
    emp_res = supabase.table("profiles").select("id, full_name, position").eq("company_id", company_id).eq("is_active", True).order("full_name").execute()
    employees = emp_res.data or []

    # All attendance in range
    att_res = supabase.table("attendance").select("user_id, status, clock_in, clock_out").eq("company_id", company_id).gte("date", first_day).lte("date", last_day).execute()
    att_rows = att_res.data or []

    # Approved leaves in range
    leave_res = supabase.table("leave_requests").select("user_id, days_count").eq("company_id", company_id).eq("status", "approved").lte("start_date", last_day).gte("end_date", first_day).execute()
    leave_rows = leave_res.data or []

    # Approved overtime in range
    ot_res = supabase.table("overtime_requests").select("user_id, duration_minutes").eq("company_id", company_id).eq("status", "approved").gte("date", first_day).lte("date", last_day).execute()
    ot_rows = ot_res.data or []

    # Build per-user index
    from collections import defaultdict
    att_by_user   = defaultdict(list)
    leave_by_user = defaultdict(int)
    ot_by_user    = defaultdict(int)

    for r in att_rows:
        att_by_user[r["user_id"]].append(r)
    for r in leave_rows:
        leave_by_user[r["user_id"]] += r.get("days_count") or 0
    for r in ot_rows:
        ot_by_user[r["user_id"]] += r.get("duration_minutes") or 0

    result = []
    for emp in employees:
        uid  = emp["id"]
        rows = att_by_user[uid]

        hadir    = sum(1 for r in rows if r.get("status") in ("present", "late", "early_leave"))
        work_min = 0
        for r in rows:
            if r.get("clock_in") and r.get("clock_out"):
                try:
                    ci = datetime.fromisoformat(r["clock_in"].replace("Z", "+00:00"))
                    co = datetime.fromisoformat(r["clock_out"].replace("Z", "+00:00"))
                    work_min += max(0, int((co - ci).total_seconds() / 60))
                except Exception:
                    pass

        result.append({
            "user_id":        uid,
            "full_name":      emp["full_name"],
            "position":       emp.get("position"),
            "hadir":          hadir,
            "cuti_days":      leave_by_user[uid],
            "lembur_minutes": ot_by_user[uid],
            "work_minutes":   work_min,
        })

    return {"year": year, "month": month, "data": result}


@router.get("/report/monthly/export")
async def export_monthly_report_csv(
    year: int = None,
    month: int = None,
    admin: dict = Depends(require_admin),
):
    """Export monthly per-employee summary as CSV."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    import calendar
    from collections import defaultdict

    today = datetime.now(ZoneInfo("Asia/Jakarta")).date()
    year  = year  or today.year
    month = month or today.month

    first_day = f"{year}-{month:02d}-01"
    last_day  = f"{year}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}"
    company_id = admin["company_id"]

    emp_res = supabase.table("profiles").select("id, full_name, position").eq("company_id", company_id).eq("is_active", True).order("full_name").execute()
    employees = emp_res.data or []

    att_res = supabase.table("attendance").select("user_id, status, clock_in, clock_out").eq("company_id", company_id).gte("date", first_day).lte("date", last_day).execute()
    att_rows = att_res.data or []

    leave_res = supabase.table("leave_requests").select("user_id, days_count").eq("company_id", company_id).eq("status", "approved").lte("start_date", last_day).gte("end_date", first_day).execute()
    leave_rows = leave_res.data or []

    ot_res = supabase.table("overtime_requests").select("user_id, duration_minutes").eq("company_id", company_id).eq("status", "approved").gte("date", first_day).lte("date", last_day).execute()
    ot_rows = ot_res.data or []

    att_by_user   = defaultdict(list)
    leave_by_user = defaultdict(int)
    ot_by_user    = defaultdict(int)
    for r in att_rows:
        att_by_user[r["user_id"]].append(r)
    for r in leave_rows:
        leave_by_user[r["user_id"]] += r.get("days_count") or 0
    for r in ot_rows:
        ot_by_user[r["user_id"]] += r.get("duration_minutes") or 0

    output = io.StringIO()
    writer = csv.writer(output)
    import calendar as cal_module
    month_name = f"{year}-{month:02d}"
    writer.writerow(["Rekap Absensi Bulanan", month_name])
    writer.writerow([])
    writer.writerow(["Nama", "Jabatan", "Hadir", "Cuti (hari)", "Lembur (menit)", "Total Kerja (jam)"])

    for emp in employees:
        uid  = emp["id"]
        rows = att_by_user[uid]
        hadir    = sum(1 for r in rows if r.get("status") in ("present", "late", "early_leave"))
        work_min = 0
        for r in rows:
            if r.get("clock_in") and r.get("clock_out"):
                try:
                    ci = datetime.fromisoformat(r["clock_in"].replace("Z", "+00:00"))
                    co = datetime.fromisoformat(r["clock_out"].replace("Z", "+00:00"))
                    work_min += max(0, int((co - ci).total_seconds() / 60))
                except Exception:
                    pass
        writer.writerow([
            emp["full_name"],
            emp.get("position") or "",
            hadir,
            leave_by_user[uid],
            ot_by_user[uid],
            round(work_min / 60, 1),
        ])

    output.seek(0)
    filename = f"rekap_{year}_{month:02d}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


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


@router.patch("/attendance/{record_id}")
async def correct_attendance(
    record_id: str,
    body: AttendanceCorrectionRequest,
    admin: dict = Depends(require_admin),
):
    """Admin corrects clock-in / clock-out time for any attendance record in their company."""
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo

    try:
        rec = supabase.table("attendance").select("company_id, date, clock_in").eq("id", record_id).single().execute()
    except Exception:
        raise HTTPException(404, "Attendance record not found")
    if not rec.data or rec.data["company_id"] != admin["company_id"]:
        raise HTTPException(404, "Attendance record not found")

    updates: dict = {}

    def parse_local(dt_str: str) -> str:
        """Accept 'YYYY-MM-DDTHH:MM' (naive, treated as WIB) and return UTC ISO string."""
        try:
            naive = datetime.fromisoformat(dt_str)
            wib = naive.replace(tzinfo=ZoneInfo("Asia/Jakarta"))
            return wib.astimezone(timezone.utc).isoformat()
        except Exception:
            raise HTTPException(400, f"Invalid datetime format: {dt_str!r}. Use YYYY-MM-DDTHH:MM")

    if body.clock_in is not None:
        updates["clock_in"] = parse_local(body.clock_in)
    if body.clock_out is not None:
        updates["clock_out"] = parse_local(body.clock_out)
    if body.notes is not None:
        updates["notes"] = body.notes

    if not updates:
        raise HTTPException(400, "Nothing to update")

    # Validate clock_out > clock_in if both are being set or one already exists
    final_in  = updates.get("clock_in")  or rec.data.get("clock_in")
    final_out = updates.get("clock_out") or rec.data.get("clock_out")
    if final_in and final_out and final_out <= final_in:
        raise HTTPException(400, "Jam keluar harus setelah jam masuk")

    supabase.table("attendance").update(updates).eq("id", record_id).execute()
    return {"message": "Attendance corrected"}


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
    if user_id == admin["id"]:
        raise HTTPException(400, "Tidak dapat mengubah role diri sendiri")

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
