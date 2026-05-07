from fastapi import APIRouter, Depends, HTTPException
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
from models.schemas import ClockInRequest, ClockOutRequest, AttendanceListResponse
from utils.auth import get_current_profile
from utils.geo import is_within_radius
from db import supabase

WIB = ZoneInfo("Asia/Jakarta")

def today_wib() -> str:
    return datetime.now(WIB).date().isoformat()

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _get_today_record(user_id: str, today: str):
    res = (
        supabase.table("attendance")
        .select("*")
        .eq("user_id", user_id)
        .eq("date", today)
        .execute()
    )
    return res.data[0] if res.data else None


@router.post("/clock-in")
async def clock_in(
    body: ClockInRequest,
    profile: dict = Depends(get_current_profile),
):
    today = today_wib()
    user_id = profile["id"]
    company = profile["companies"]

    # Validate: no double clock-in
    existing = _get_today_record(user_id, today)
    if existing and existing.get("clock_in"):
        raise HTTPException(400, "Already clocked in today")

    # Validate GPS radius
    if company["lat"] and company["lng"]:
        within, distance = is_within_radius(
            body.lat, body.lng,
            company["lat"], company["lng"],
            company["radius_meters"],
        )
        if not within:
            raise HTTPException(
                400,
                f"You are {distance}m away from the office. "
                f"Must be within {company['radius_meters']}m",
            )
    else:
        distance = 0

    now_utc = datetime.now(timezone.utc)
    now = now_utc.isoformat()

    # Determine late status — compare in local (WIB) time
    work_start = company.get("work_start", "08:00:00")
    clock_time = now_utc.astimezone(WIB).strftime("%H:%M:%S")
    status = "late" if clock_time > work_start else "present"

    if existing:
        # Update existing row (created by admin absence marking)
        res = (
            supabase.table("attendance")
            .update({
                "clock_in": now,
                "clock_in_lat": body.lat,
                "clock_in_lng": body.lng,
                "clock_in_distance_m": distance,
                "status": status,
                "notes": body.notes,
            })
            .eq("id", existing["id"])
            .execute()
        )
    else:
        res = (
            supabase.table("attendance")
            .insert({
                "user_id": user_id,
                "company_id": profile["company_id"],
                "date": today,
                "clock_in": now,
                "clock_in_lat": body.lat,
                "clock_in_lng": body.lng,
                "clock_in_distance_m": distance,
                "status": status,
                "notes": body.notes,
            })
            .execute()
        )

    return {
        "message": "Clock-in successful",
        "time": now,
        "distance_m": distance,
        "status": status,
    }


@router.post("/clock-out")
async def clock_out(
    body: ClockOutRequest,
    profile: dict = Depends(get_current_profile),
):
    today = today_wib()
    user_id = profile["id"]
    company = profile["companies"]

    existing = _get_today_record(user_id, today)
    if not existing or not existing.get("clock_in"):
        raise HTTPException(400, "You haven't clocked in today")
    if existing.get("clock_out"):
        raise HTTPException(400, "Already clocked out today")

    # GPS validation
    if company["lat"] and company["lng"]:
        within, distance = is_within_radius(
            body.lat, body.lng,
            company["lat"], company["lng"],
            company["radius_meters"],
        )
        if not within:
            raise HTTPException(
                400,
                f"You are {distance}m from office. Must be within {company['radius_meters']}m",
            )
    else:
        distance = 0

    now_utc = datetime.now(timezone.utc)
    now = now_utc.isoformat()

    # Check early leave — compare in local (WIB) time
    # Only override to early_leave if not already late (preserve late status)
    work_end = company.get("work_end", "17:00:00")
    clock_time = now_utc.astimezone(WIB).strftime("%H:%M:%S")
    status = existing["status"]
    if clock_time < work_end and status != "late":
        status = "early_leave"

    supabase.table("attendance").update({
        "clock_out": now,
        "clock_out_lat": body.lat,
        "clock_out_lng": body.lng,
        "clock_out_distance_m": distance,
        "status": status,
    }).eq("id", existing["id"]).execute()

    return {"message": "Clock-out successful", "time": now, "distance_m": distance}


@router.get("/today")
async def get_today(profile: dict = Depends(get_current_profile)):
    today = today_wib()
    record = _get_today_record(profile["id"], today)
    return {"date": today, "record": record}


@router.get("/history")
async def get_history(
    page: int = 1,
    per_page: int = 10,
    date_from: str = None,
    date_to: str = None,
    profile: dict = Depends(get_current_profile),
):
    offset = (page - 1) * per_page
    q = (
        supabase.table("attendance")
        .select("*", count="exact")
        .eq("user_id", profile["id"])
        .order("date", desc=True)
    )
    if date_from:
        q = q.gte("date", date_from)
    if date_to:
        q = q.lte("date", date_to)
    res = q.range(offset, offset + per_page - 1).execute()
    return {
        "data": res.data,
        "total": res.count,
        "page": page,
        "per_page": per_page,
    }


@router.get("/monthly-stats")
async def monthly_stats(profile: dict = Depends(get_current_profile)):
    """Returns this month's hadir/cuti/lembur counts for the current user."""
    import calendar
    today = datetime.now(WIB).date()
    first_day = today.replace(day=1).isoformat()
    last_day = today.replace(day=calendar.monthrange(today.year, today.month)[1]).isoformat()
    user_id = profile["id"]

    # Days with clock-in this month
    att_res = (
        supabase.table("attendance")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .gte("date", first_day)
        .lte("date", last_day)
        .not_.is_("clock_in", "null")
        .execute()
    )

    # Approved leave days overlapping this month
    leave_res = (
        supabase.table("leave_requests")
        .select("days_count")
        .eq("user_id", user_id)
        .eq("status", "approved")
        .lte("start_date", last_day)
        .gte("end_date", first_day)
        .execute()
    )

    # Approved overtime sessions this month
    ot_res = (
        supabase.table("overtime_requests")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("status", "approved")
        .gte("date", first_day)
        .lte("date", last_day)
        .execute()
    )

    total_leave_days = sum(r.get("days_count") or 0 for r in (leave_res.data or []))

    # Total working minutes: sum (clock_out - clock_in) for days with both timestamps
    work_res = (
        supabase.table("attendance")
        .select("clock_in, clock_out")
        .eq("user_id", user_id)
        .gte("date", first_day)
        .lte("date", last_day)
        .not_.is_("clock_in", "null")
        .not_.is_("clock_out", "null")
        .execute()
    )
    total_work_minutes = 0
    for r in (work_res.data or []):
        try:
            ci = datetime.fromisoformat(r["clock_in"].replace("Z", "+00:00"))
            co = datetime.fromisoformat(r["clock_out"].replace("Z", "+00:00"))
            total_work_minutes += int((co - ci).total_seconds() / 60)
        except Exception:
            pass

    return {
        "hadir": att_res.count or 0,
        "cuti": total_leave_days,
        "lembur": ot_res.count or 0,
        "total_work_minutes": total_work_minutes,
    }
