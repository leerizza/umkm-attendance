from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from models.schemas import OvertimeCreateRequest, OvertimeApproveRequest
from utils.auth import get_current_profile, require_admin
from db import supabase

router = APIRouter(prefix="/overtime", tags=["overtime"])


def _check_overlap(user_id: str, req_date: str, start: str, end: str, exclude_id: str = None):
    q = (
        supabase.table("overtime_requests")
        .select("id")
        .eq("user_id", user_id)
        .eq("date", req_date)
        .in_("status", ["pending", "approved"])
        .lt("start_time", end)
        .gt("end_time", start)
    )
    if exclude_id:
        q = q.neq("id", exclude_id)
    res = q.execute()
    return len(res.data) > 0


@router.post("")
async def create_overtime(
    body: OvertimeCreateRequest,
    profile: dict = Depends(get_current_profile),
):
    user_id = profile["id"]
    req_date = body.date.isoformat()

    if _check_overlap(user_id, req_date, body.start_time, body.end_time):
        raise HTTPException(400, "Overtime hours overlap with an existing request")

    res = supabase.table("overtime_requests").insert({
        "user_id": user_id,
        "company_id": profile["company_id"],
        "date": req_date,
        "start_time": body.start_time,
        "end_time": body.end_time,
        "reason": body.reason,
        "status": "pending",
    }).execute()

    return {"message": "Overtime request submitted", "data": res.data[0]}


@router.get("")
async def get_my_overtime(
    page: int = 1,
    per_page: int = 20,
    profile: dict = Depends(get_current_profile),
):
    offset = (page - 1) * per_page
    res = (
        supabase.table("overtime_requests")
        .select("*", count="exact")
        .eq("user_id", profile["id"])
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )
    return {"data": res.data, "total": res.count, "page": page, "per_page": per_page}


@router.post("/{ot_id}/approve")
async def approve_overtime(
    ot_id: str,
    body: OvertimeApproveRequest,
    admin: dict = Depends(require_admin),
):
    if body.status not in ("approved", "rejected"):
        raise HTTPException(400, "status must be 'approved' or 'rejected'")

    res = supabase.table("overtime_requests").select("*").eq("id", ot_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Overtime request not found")
    if res.data["company_id"] != admin["company_id"]:
        raise HTTPException(403, "Not authorized")
    if res.data["user_id"] == admin["id"]:
        raise HTTPException(403, "Cannot approve your own overtime request")
    if res.data["status"] != "pending":
        raise HTTPException(400, "Request already processed")

    supabase.table("overtime_requests").update({
        "status": body.status,
        "reviewed_by": admin["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "reviewer_note": body.reviewer_note,
    }).eq("id", ot_id).execute()

    return {"message": f"Overtime request {body.status}"}
