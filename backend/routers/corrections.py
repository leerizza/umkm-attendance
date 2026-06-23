from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional
from utils.auth import get_current_profile, require_admin
from db import supabase

router = APIRouter(prefix="/corrections", tags=["corrections"])


class CorrectionCreateRequest(BaseModel):
    attendance_id: str
    requested_clock_in: Optional[str] = None   # "YYYY-MM-DDTHH:MM" WIB (naive)
    requested_clock_out: Optional[str] = None  # "YYYY-MM-DDTHH:MM" WIB (naive)
    reason: str


class CorrectionApproveRequest(BaseModel):
    status: str  # approved | rejected
    reviewer_note: Optional[str] = None


def _parse_wib(dt_str: str) -> str:
    """Convert naive WIB datetime string to UTC ISO string."""
    from zoneinfo import ZoneInfo
    try:
        naive = datetime.fromisoformat(dt_str)
        wib = naive.replace(tzinfo=ZoneInfo("Asia/Jakarta"))
        return wib.astimezone(timezone.utc).isoformat()
    except Exception:
        raise HTTPException(400, f"Format waktu tidak valid: {dt_str!r}. Gunakan YYYY-MM-DDTHH:MM")


# ─── Employee endpoints ───────────────────────────────────────────────────────

@router.post("")
async def create_correction(
    body: CorrectionCreateRequest,
    profile: dict = Depends(get_current_profile),
):
    if not body.requested_clock_in and not body.requested_clock_out:
        raise HTTPException(400, "Isi setidaknya jam masuk atau jam keluar yang diinginkan")

    # Verify the attendance record belongs to this user
    try:
        rec = supabase.table("attendance").select("id, user_id").eq("id", body.attendance_id).single().execute()
    except Exception:
        raise HTTPException(404, "Data absensi tidak ditemukan")
    if not rec.data or rec.data["user_id"] != profile["id"]:
        raise HTTPException(403, "Tidak diizinkan")

    # Only one pending correction per attendance record
    existing = (
        supabase.table("attendance_corrections")
        .select("id")
        .eq("attendance_id", body.attendance_id)
        .eq("status", "pending")
        .execute()
    )
    if existing.data:
        raise HTTPException(400, "Sudah ada pengajuan koreksi yang sedang menunggu persetujuan untuk absensi ini")

    payload: dict = {
        "attendance_id": body.attendance_id,
        "user_id": profile["id"],
        "company_id": profile["company_id"],
        "reason": body.reason,
        "status": "pending",
    }
    if body.requested_clock_in:
        payload["requested_clock_in"] = _parse_wib(body.requested_clock_in)
    if body.requested_clock_out:
        payload["requested_clock_out"] = _parse_wib(body.requested_clock_out)

    if payload.get("requested_clock_in") and payload.get("requested_clock_out"):
        if payload["requested_clock_out"] <= payload["requested_clock_in"]:
            raise HTTPException(400, "Jam keluar koreksi harus setelah jam masuk koreksi")

    supabase.table("attendance_corrections").insert(payload).execute()
    return {"message": "Pengajuan koreksi terkirim"}


@router.get("")
async def get_my_corrections(
    page: int = 1,
    per_page: int = 20,
    profile: dict = Depends(get_current_profile),
):
    per_page = min(per_page, 100)
    offset = (page - 1) * per_page
    res = (
        supabase.table("attendance_corrections")
        .select("*, attendance(date, clock_in, clock_out)", count="exact")
        .eq("user_id", profile["id"])
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )
    return {"data": res.data, "total": res.count, "page": page, "per_page": per_page}


# ─── Admin endpoints ──────────────────────────────────────────────────────────

@router.get("/admin")
async def admin_list_corrections(
    page: int = 1,
    per_page: int = 10,
    status_filter: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    admin: dict = Depends(require_admin),
):
    per_page = min(per_page, 100)
    offset = (page - 1) * per_page
    q = (
        supabase.table("attendance_corrections")
        .select("*, profiles!user_id(full_name, position), attendance(date, clock_in, clock_out)", count="exact")
        .eq("company_id", admin["company_id"])
        .order("created_at", desc=True)
    )
    if status_filter:
        q = q.eq("status", status_filter)
    if date_from:
        q = q.gte("created_at", date_from)
    if date_to:
        q = q.lte("created_at", date_to + "T23:59:59")
    res = q.range(offset, offset + per_page - 1).execute()
    return {"data": res.data, "total": res.count, "page": page, "per_page": per_page}


@router.post("/{correction_id}/approve")
async def approve_correction(
    correction_id: str,
    body: CorrectionApproveRequest,
    admin: dict = Depends(require_admin),
):
    if body.status not in ("approved", "rejected"):
        raise HTTPException(400, "status harus 'approved' atau 'rejected'")

    try:
        corr = supabase.table("attendance_corrections").select("*").eq("id", correction_id).single().execute()
    except Exception:
        raise HTTPException(404, "Pengajuan koreksi tidak ditemukan")
    if not corr.data or corr.data["company_id"] != admin["company_id"]:
        raise HTTPException(404, "Pengajuan koreksi tidak ditemukan")
    if corr.data["status"] != "pending":
        raise HTTPException(400, "Pengajuan ini sudah diproses sebelumnya")
    if corr.data["user_id"] == admin["id"]:
        other_admins = (
            supabase.table("profiles")
            .select("id", count="exact")
            .eq("company_id", admin["company_id"])
            .eq("role", "admin")
            .eq("is_active", True)
            .neq("id", admin["id"])
            .execute()
        )
        if other_admins.count and other_admins.count > 0:
            raise HTTPException(403, "Tidak dapat menyetujui pengajuan koreksi milik sendiri")

    # Update correction record
    supabase.table("attendance_corrections").update({
        "status": body.status,
        "reviewed_by": admin["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "reviewer_note": body.reviewer_note,
    }).eq("id", correction_id).execute()

    # If approved → apply the requested times to the attendance record
    if body.status == "approved":
        updates: dict = {}
        if corr.data.get("requested_clock_in"):
            updates["clock_in"] = corr.data["requested_clock_in"]
        if corr.data.get("requested_clock_out"):
            updates["clock_out"] = corr.data["requested_clock_out"]
        if updates:
            # Recalculate status for flexible-attendance companies so that
            # a corrected clock-in/out is reflected immediately in the record.
            try:
                att = supabase.table("attendance").select("*").eq("id", corr.data["attendance_id"]).single().execute()
                if att.data:
                    merged = {**att.data, **updates}
                    comp = supabase.table("companies").select("flexible_attendance, min_work_minutes").eq("id", corr.data["company_id"]).single().execute()
                    if comp.data and comp.data.get("flexible_attendance") and merged.get("clock_in") and merged.get("clock_out"):
                        from routers.attendance import effective_work_minutes
                        work_min = effective_work_minutes(merged)
                        min_req = comp.data.get("min_work_minutes") or 480
                        updates["status"] = "present" if work_min >= min_req else "early_leave"
            except Exception:
                pass
            supabase.table("attendance").update(updates).eq("id", corr.data["attendance_id"]).execute()

    return {"message": f"Koreksi {body.status}"}
