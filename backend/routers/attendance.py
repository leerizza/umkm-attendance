from fastapi import APIRouter, Depends, HTTPException
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
from models.schemas import ClockInRequest, ClockOutRequest, BreakRequest, AttendanceListResponse
from utils.auth import get_current_profile
from utils.geo import is_within_radius
from db import supabase

WIB = ZoneInfo("Asia/Jakarta")

def today_wib() -> str:
    return datetime.now(WIB).date().isoformat()

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return None


def effective_work_minutes(rec: dict) -> int:
    """Total minutes worked = (clock_in → break_start) + (break_end → clock_out).
    Falls back gracefully when break columns are NULL (legacy / non-flexible)."""
    ci = _parse_iso(rec.get("clock_in"))
    co = _parse_iso(rec.get("clock_out"))
    if not ci or not co:
        return 0
    bs = _parse_iso(rec.get("break_start"))
    be = _parse_iso(rec.get("break_end"))
    if bs and be and bs >= ci and be <= co and be > bs:
        return max(0, int((bs - ci).total_seconds() / 60) + int((co - be).total_seconds() / 60))
    return max(0, int((co - ci).total_seconds() / 60))


def _get_today_record(user_id: str, today: str):
    res = (
        supabase.table("attendance")
        .select("*")
        .eq("user_id", user_id)
        .eq("date", today)
        .execute()
    )
    return res.data[0] if res.data else None


def _validate_radius(body, company) -> int:
    if company.get("lat") is None or company.get("lng") is None:
        return 0
    within, distance = is_within_radius(
        body.lat, body.lng,
        company["lat"], company["lng"],
        company["radius_meters"],
    )
    if not within:
        raise HTTPException(
            400,
            f"Kamu berada {distance}m dari kantor. Maksimal {company['radius_meters']}m.",
        )
    return distance


@router.post("/clock-in")
async def clock_in(
    body: ClockInRequest,
    profile: dict = Depends(get_current_profile),
):
    today = today_wib()
    user_id = profile["id"]
    company = profile["companies"]

    existing = _get_today_record(user_id, today)
    if existing and existing.get("clock_in"):
        raise HTTPException(400, "Sudah clock-in hari ini")

    distance = _validate_radius(body, company)

    now = datetime.now(timezone.utc).isoformat()
    status = "present"

    if existing:
        supabase.table("attendance").update({
            "clock_in": now,
            "clock_in_lat": body.lat,
            "clock_in_lng": body.lng,
            "clock_in_distance_m": distance,
            "status": status,
            "notes": body.notes,
        }).eq("id", existing["id"]).execute()
    else:
        supabase.table("attendance").insert({
            "user_id": user_id,
            "company_id": profile["company_id"],
            "date": today,
            "clock_in": now,
            "clock_in_lat": body.lat,
            "clock_in_lng": body.lng,
            "clock_in_distance_m": distance,
            "status": status,
            "notes": body.notes,
        }).execute()

    return {
        "message": "Clock-in berhasil",
        "time": now,
        "distance_m": distance,
        "status": status,
    }


@router.post("/break-start")
async def break_start(
    body: BreakRequest,
    profile: dict = Depends(get_current_profile),
):
    """Mulai istirahat — hanya untuk perusahaan yang aktifkan mode fleksibel."""
    company = profile["companies"]
    if not company.get("flexible_attendance"):
        raise HTTPException(400, "Mode absensi fleksibel belum diaktifkan")

    existing = _get_today_record(profile["id"], today_wib())
    if not existing or not existing.get("clock_in"):
        raise HTTPException(400, "Belum clock-in hari ini")
    if existing.get("clock_out"):
        raise HTTPException(400, "Sudah clock-out, tidak bisa mulai istirahat")
    if existing.get("break_start"):
        raise HTTPException(400, "Istirahat sudah dimulai")

    _validate_radius(body, company)
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("attendance").update({"break_start": now}).eq("id", existing["id"]).execute()
    return {"message": "Mulai istirahat", "time": now}


@router.post("/break-end")
async def break_end(
    body: BreakRequest,
    profile: dict = Depends(get_current_profile),
):
    """Selesai istirahat — lanjut kerja."""
    company = profile["companies"]
    if not company.get("flexible_attendance"):
        raise HTTPException(400, "Mode absensi fleksibel belum diaktifkan")

    existing = _get_today_record(profile["id"], today_wib())
    if not existing or not existing.get("break_start"):
        raise HTTPException(400, "Istirahat belum dimulai")
    if existing.get("break_end"):
        raise HTTPException(400, "Istirahat sudah selesai")

    _validate_radius(body, company)
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("attendance").update({"break_end": now}).eq("id", existing["id"]).execute()
    return {"message": "Selesai istirahat", "time": now}


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
        raise HTTPException(400, "Belum clock-in hari ini")
    if existing.get("clock_out"):
        raise HTTPException(400, "Sudah clock-out hari ini")
    # Block clock-out while a break is still open
    if existing.get("break_start") and not existing.get("break_end"):
        raise HTTPException(400, "Selesaikan istirahat dulu sebelum clock-out")

    distance = _validate_radius(body, company)

    now_utc = datetime.now(timezone.utc)
    now = now_utc.isoformat()

    merged = {**existing, "clock_out": now}
    work_min = effective_work_minutes(merged)
    # Status is duration-based only when the company has opted into flexible mode.
    # Non-flexible companies keep their legacy behavior (status set at clock-in).
    if company.get("flexible_attendance"):
        min_required = company.get("min_work_minutes") or 480
        status = "present" if work_min >= min_required else "early_leave"
    else:
        status = existing["status"]

    supabase.table("attendance").update({
        "clock_out": now,
        "clock_out_lat": body.lat,
        "clock_out_lng": body.lng,
        "clock_out_distance_m": distance,
        "status": status,
    }).eq("id", existing["id"]).execute()

    return {
        "message": "Clock-out berhasil",
        "time": now,
        "distance_m": distance,
        "work_minutes": work_min,
        "status": status,
    }


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
    per_page = min(per_page, 100)
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

    att_res = (
        supabase.table("attendance")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .gte("date", first_day)
        .lte("date", last_day)
        .not_.is_("clock_in", "null")
        .execute()
    )

    leave_res = (
        supabase.table("leave_requests")
        .select("days_count")
        .eq("user_id", user_id)
        .eq("status", "approved")
        .lte("start_date", last_day)
        .gte("end_date", first_day)
        .execute()
    )

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

    work_res = (
        supabase.table("attendance")
        .select("clock_in, clock_out, break_start, break_end")
        .eq("user_id", user_id)
        .gte("date", first_day)
        .lte("date", last_day)
        .not_.is_("clock_in", "null")
        .not_.is_("clock_out", "null")
        .execute()
    )
    total_work_minutes = sum(effective_work_minutes(r) for r in (work_res.data or []))

    return {
        "hadir": att_res.count or 0,
        "cuti": total_leave_days,
        "lembur": ot_res.count or 0,
        "total_work_minutes": total_work_minutes,
    }
