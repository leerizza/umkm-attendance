from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from datetime import datetime, timezone, date, timedelta
import logging
from models.schemas import LeaveCreateRequest, LeaveApproveRequest
from utils.auth import get_current_profile, require_admin
from utils.email import send_leave_decision_email, send_sick_note_notification
from db import supabase

_log = logging.getLogger(__name__)

# Default annual leave allowance (days/year) if not set per company
DEFAULT_ANNUAL_ALLOWANCE = 12

router = APIRouter(prefix="/leave", tags=["leave"])


def _count_business_days(
    start: date, end: date,
    work_saturday: bool = False, work_sunday: bool = False,
) -> int:
    """Count work days between start and end inclusive, respecting company schedule."""
    count = 0
    cur = start
    while cur <= end:
        wd = cur.weekday()  # 0=Mon … 6=Sun
        if wd < 5:
            count += 1
        elif wd == 5 and work_saturday:
            count += 1
        elif wd == 6 and work_sunday:
            count += 1
        cur += timedelta(days=1)
    return count


def _check_overlap(user_id: str, start: str, end: str, exclude_id: str = None):
    """Check if any approved/pending leave overlaps the requested dates."""
    q = (
        supabase.table("leave_requests")
        .select("id")
        .eq("user_id", user_id)
        .in_("status", ["pending", "approved"])
        .lte("start_date", end)
        .gte("end_date", start)
    )
    if exclude_id:
        q = q.neq("id", exclude_id)
    res = q.execute()
    return len(res.data) > 0


def _delete_sick_note(path: str) -> None:
    """Best-effort deletion of a sick note file from Supabase Storage."""
    try:
        supabase.storage.from_("sick-notes").remove([path])
    except Exception as e:
        _log.warning("_delete_sick_note: gagal hapus %s: %s", path, e)


@router.post("")
async def create_leave(
    body: LeaveCreateRequest,
    background_tasks: BackgroundTasks,
    profile: dict = Depends(get_current_profile),
):
    user_id = profile["id"]
    start = body.start_date.isoformat()
    end = body.end_date.isoformat()

    if _check_overlap(user_id, start, end):
        raise HTTPException(400, "Leave dates overlap with an existing request")

    # Enforce annual leave quota for all types except sick leave.
    # Sick leave is uncapped; annual/personal/other share the quota.
    # Quota is counted in business days respecting company's work_saturday/work_sunday.
    if body.leave_type != "sick":
        allowance = DEFAULT_ANNUAL_ALLOWANCE
        work_saturday = False
        work_sunday = False
        try:
            comp = supabase.table("companies").select("leave_allowance, work_saturday, work_sunday").eq("id", profile["company_id"]).single().execute()
            if comp.data:
                if comp.data.get("leave_allowance"):
                    allowance = comp.data["leave_allowance"]
                work_saturday = bool(comp.data.get("work_saturday"))
                work_sunday   = bool(comp.data.get("work_sunday"))
        except Exception as e:
            _log.warning("create_leave: failed to fetch company config for %s: %s", profile["company_id"], e)

        days_requested = _count_business_days(body.start_date, body.end_date, work_saturday, work_sunday)
        if days_requested == 0:
            raise HTTPException(400, "Tanggal yang dipilih tidak mengandung hari kerja.")

        year = body.start_date.year
        first_day = f"{year}-01-01"
        last_day  = f"{year}-12-31"

        used_res = (
            supabase.table("leave_requests")
            .select("start_date, end_date")
            .eq("user_id", user_id)
            .neq("leave_type", "sick")
            .in_("status", ["approved", "pending"])
            .gte("start_date", first_day)
            .lte("end_date", last_day)
            .execute()
        )
        used = sum(
            _count_business_days(
                date.fromisoformat(r["start_date"]),
                date.fromisoformat(r["end_date"]),
                work_saturday, work_sunday,
            )
            for r in (used_res.data or [])
        )
        remaining = allowance - used
        if days_requested > remaining:
            raise HTTPException(
                400,
                f"Sisa jatah cuti tidak cukup. Sisa: {remaining} hari kerja, diminta: {days_requested} hari kerja."
            )

    payload: dict = {
        "user_id": user_id,
        "company_id": profile["company_id"],
        "leave_type": body.leave_type,
        "start_date": start,
        "end_date": end,
        "reason": body.reason,
        "status": "pending",
    }
    if body.sick_note_path and body.leave_type == "sick":
        payload["attachment_url"] = body.sick_note_path

    supabase.table("leave_requests").insert(payload).execute()

    # Notify all company admins when a sick note is attached
    if body.leave_type == "sick" and body.sick_note_path:
        try:
            signed = supabase.storage.from_("sick-notes").create_signed_url(body.sick_note_path, 7 * 24 * 3600)
            signed_url = signed.get("signedURL") or (signed.get("data") or {}).get("signedUrl", "")
            if signed_url:
                admin_res = (
                    supabase.table("profiles")
                    .select("id")
                    .eq("company_id", profile["company_id"])
                    .eq("role", "admin")
                    .eq("is_active", True)
                    .execute()
                )
                admin_ids = [a["id"] for a in (admin_res.data or [])]
                background_tasks.add_task(
                    send_sick_note_notification,
                    admin_user_ids=admin_ids,
                    employee_name=profile.get("full_name", "Karyawan"),
                    start_date=start,
                    end_date=end,
                    reason=body.reason,
                    signed_url=signed_url,
                )
        except Exception as e:
            _log.error("Sick note notification failed: %s", e)

    return {"message": "Leave request submitted"}


@router.get("/balance")
async def get_leave_balance(
    profile: dict = Depends(get_current_profile),
):
    """Return annual leave balance for the current user this year (in business days)."""
    user_id = profile["id"]
    year = date.today().year
    first_day = f"{year}-01-01"
    last_day  = f"{year}-12-31"

    # Company allowance + work schedule
    allowance = DEFAULT_ANNUAL_ALLOWANCE
    work_saturday = False
    work_sunday = False
    try:
        comp = supabase.table("companies").select("leave_allowance, work_saturday, work_sunday").eq("id", profile["company_id"]).single().execute()
        if comp.data:
            if comp.data.get("leave_allowance"):
                allowance = comp.data["leave_allowance"]
            work_saturday = bool(comp.data.get("work_saturday"))
            work_sunday   = bool(comp.data.get("work_sunday"))
    except Exception as e:
        _log.warning("get_leave_balance: failed to fetch company config for %s: %s", profile["company_id"], e)

    # Sum approved+pending non-sick leave days this year — mirrors the quota check in
    # create_leave so that the balance shown is the same as what's actually enforced.
    res = (
        supabase.table("leave_requests")
        .select("start_date, end_date")
        .eq("user_id", user_id)
        .neq("leave_type", "sick")
        .in_("status", ["approved", "pending"])
        .gte("start_date", first_day)
        .lte("end_date", last_day)
        .execute()
    )
    used = sum(
        _count_business_days(
            date.fromisoformat(r["start_date"]),
            date.fromisoformat(r["end_date"]),
            work_saturday, work_sunday,
        )
        for r in (res.data or [])
    )

    return {
        "year": year,
        "allowance": allowance,
        "used": used,
        "remaining": max(0, allowance - used),
    }


@router.get("")
async def get_my_leave(
    page: int = 1,
    per_page: int = 10,
    date_from: str = None,
    date_to: str = None,
    profile: dict = Depends(get_current_profile),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(400, "date_from tidak boleh setelah date_to")
    per_page = min(per_page, 100)
    offset = (page - 1) * per_page
    q = (
        supabase.table("leave_requests")
        .select("*", count="exact")
        .eq("user_id", profile["id"])
        .order("created_at", desc=True)
    )
    if date_from:
        q = q.gte("start_date", date_from)
    if date_to:
        q = q.lte("start_date", date_to)
    res = q.range(offset, offset + per_page - 1).execute()
    return {"data": res.data, "total": res.count, "page": page, "per_page": per_page}


@router.put("/{leave_id}")
async def update_leave(
    leave_id: str,
    body: LeaveCreateRequest,
    profile: dict = Depends(get_current_profile),
):
    try:
        res = supabase.table("leave_requests").select("user_id, status, leave_type, attachment_url").eq("id", leave_id).single().execute()
    except Exception:
        raise HTTPException(404, "Leave request not found")
    if not res.data:
        raise HTTPException(404, "Leave request not found")
    if res.data["user_id"] != profile["id"]:
        raise HTTPException(403, "Not authorized")
    if res.data["status"] != "pending":
        raise HTTPException(400, "Hanya pengajuan yang masih menunggu yang bisa dikoreksi")

    start = body.start_date.isoformat()
    end = body.end_date.isoformat()

    if _check_overlap(profile["id"], start, end, exclude_id=leave_id):
        raise HTTPException(400, "Leave dates overlap with an existing request")

    if body.leave_type != "sick":
        allowance = DEFAULT_ANNUAL_ALLOWANCE
        work_saturday = False
        work_sunday = False
        try:
            comp = supabase.table("companies").select("leave_allowance, work_saturday, work_sunday").eq("id", profile["company_id"]).single().execute()
            if comp.data:
                if comp.data.get("leave_allowance"):
                    allowance = comp.data["leave_allowance"]
                work_saturday = bool(comp.data.get("work_saturday"))
                work_sunday   = bool(comp.data.get("work_sunday"))
        except Exception as e:
            _log.warning("update_leave: failed to fetch company config for %s: %s", profile["company_id"], e)

        days_requested = _count_business_days(body.start_date, body.end_date, work_saturday, work_sunday)
        if days_requested == 0:
            raise HTTPException(400, "Tanggal yang dipilih tidak mengandung hari kerja.")

        year = body.start_date.year
        first_day = f"{year}-01-01"
        last_day  = f"{year}-12-31"

        used_res = (
            supabase.table("leave_requests")
            .select("start_date, end_date")
            .eq("user_id", profile["id"])
            .neq("leave_type", "sick")
            .in_("status", ["approved", "pending"])
            .gte("start_date", first_day)
            .lte("end_date", last_day)
            .neq("id", leave_id)
            .execute()
        )
        used = sum(
            _count_business_days(
                date.fromisoformat(r["start_date"]),
                date.fromisoformat(r["end_date"]),
                work_saturday, work_sunday,
            )
            for r in (used_res.data or [])
        )
        remaining = allowance - used
        if days_requested > remaining:
            raise HTTPException(
                400,
                f"Sisa jatah cuti tidak cukup. Sisa: {remaining} hari kerja, diminta: {days_requested} hari kerja."
            )

    update_data: dict = {
        "leave_type": body.leave_type,
        "start_date": start,
        "end_date": end,
        "reason": body.reason,
    }
    if res.data.get("leave_type") == "sick" and body.leave_type != "sick" and res.data.get("attachment_url"):
        _delete_sick_note(res.data["attachment_url"])
        update_data["attachment_url"] = None
    supabase.table("leave_requests").update(update_data).eq("id", leave_id).execute()

    return {"message": "Leave request updated"}


@router.delete("/{leave_id}")
async def cancel_leave(
    leave_id: str,
    profile: dict = Depends(get_current_profile),
):
    try:
        res = supabase.table("leave_requests").select("user_id, status, leave_type, attachment_url").eq("id", leave_id).single().execute()
    except Exception:
        raise HTTPException(404, "Leave request not found")
    if not res.data:
        raise HTTPException(404, "Leave request not found")
    if res.data["user_id"] != profile["id"]:
        raise HTTPException(403, "Not authorized")
    if res.data["status"] != "pending":
        raise HTTPException(400, "Hanya pengajuan yang masih menunggu yang bisa dibatalkan")

    update_payload: dict = {"status": "cancelled"}
    if res.data.get("leave_type") == "sick" and res.data.get("attachment_url"):
        _delete_sick_note(res.data["attachment_url"])
        update_payload["attachment_url"] = None
    supabase.table("leave_requests").update(update_payload).eq("id", leave_id).execute()
    return {"message": "Leave request cancelled"}


@router.post("/{leave_id}/approve")
async def approve_leave(
    leave_id: str,
    body: LeaveApproveRequest,
    background_tasks: BackgroundTasks,
    admin: dict = Depends(require_admin),
):
    if body.status not in ("approved", "rejected"):
        raise HTTPException(400, "status must be 'approved' or 'rejected'")

    # Verify same company
    try:
        res = supabase.table("leave_requests").select("*").eq("id", leave_id).single().execute()
    except Exception:
        raise HTTPException(404, "Leave request not found")
    if not res.data:
        raise HTTPException(404, "Leave request not found")
    if res.data["company_id"] != admin["company_id"]:
        raise HTTPException(403, "Not authorized")
    if res.data["user_id"] == admin["id"]:
        raise HTTPException(403, "Cannot approve your own leave request")
    if res.data["status"] != "pending":
        raise HTTPException(400, "Request already processed")

    update_leave_data: dict = {
        "status": body.status,
        "reviewed_by": admin["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "reviewer_note": body.reviewer_note,
    }
    if body.status == "rejected" and res.data.get("leave_type") == "sick" and res.data.get("attachment_url"):
        _delete_sick_note(res.data["attachment_url"])
        update_leave_data["attachment_url"] = None
    supabase.table("leave_requests").update(update_leave_data).eq("id", leave_id).execute()

    # Fetch employee name for email
    full_name = "Karyawan"
    try:
        p = supabase.table("profiles").select("full_name").eq("id", res.data["user_id"]).single().execute()
        if p.data:
            full_name = p.data.get("full_name", "Karyawan")
    except Exception as e:
        _log.warning("approve_leave: failed to fetch employee name for %s: %s", res.data["user_id"], e)

    background_tasks.add_task(
        send_leave_decision_email,
        user_id=res.data["user_id"],
        full_name=full_name,
        leave_type=res.data["leave_type"],
        start_date=res.data["start_date"],
        end_date=res.data["end_date"],
        status=body.status,
        reviewer_note=body.reviewer_note,
    )

    return {"message": f"Leave request {body.status}"}
