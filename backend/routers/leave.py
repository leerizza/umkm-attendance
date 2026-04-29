from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from models.schemas import LeaveCreateRequest, LeaveApproveRequest
from utils.auth import get_current_profile, require_admin
from db import supabase

router = APIRouter(prefix="/leave", tags=["leave"])


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


@router.post("")
async def create_leave(
    body: LeaveCreateRequest,
    profile: dict = Depends(get_current_profile),
):
    user_id = profile["id"]
    start = body.start_date.isoformat()
    end = body.end_date.isoformat()

    if _check_overlap(user_id, start, end):
        raise HTTPException(400, "Leave dates overlap with an existing request")

    days_count = (body.end_date - body.start_date).days + 1

    res = supabase.table("leave_requests").insert({
        "user_id": user_id,
        "company_id": profile["company_id"],
        "leave_type": body.leave_type,
        "start_date": start,
        "end_date": end,
        "days_count": days_count,
        "reason": body.reason,
        "status": "pending",
    }).execute()

    return {"message": "Leave request submitted", "data": res.data[0]}


@router.get("")
async def get_my_leave(
    page: int = 1,
    per_page: int = 20,
    profile: dict = Depends(get_current_profile),
):
    offset = (page - 1) * per_page
    res = (
        supabase.table("leave_requests")
        .select("*", count="exact")
        .eq("user_id", profile["id"])
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )
    return {"data": res.data, "total": res.count, "page": page, "per_page": per_page}


@router.post("/{leave_id}/approve")
async def approve_leave(
    leave_id: str,
    body: LeaveApproveRequest,
    admin: dict = Depends(require_admin),
):
    if body.status not in ("approved", "rejected"):
        raise HTTPException(400, "status must be 'approved' or 'rejected'")

    # Verify same company
    res = supabase.table("leave_requests").select("*").eq("id", leave_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Leave request not found")
    if res.data["company_id"] != admin["company_id"]:
        raise HTTPException(403, "Not authorized")
    if res.data["user_id"] == admin["id"]:
        raise HTTPException(403, "Cannot approve your own leave request")
    if res.data["status"] != "pending":
        raise HTTPException(400, "Request already processed")

    supabase.table("leave_requests").update({
        "status": body.status,
        "reviewed_by": admin["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "reviewer_note": body.reviewer_note,
    }).eq("id", leave_id).execute()

    return {"message": f"Leave request {body.status}"}
