from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from db import supabase
from utils.auth import get_current_user, get_current_profile

router = APIRouter(prefix="/demo", tags=["demo"])


def _assert_demo(email: str):
    if not (email.startswith("demo.") and email.endswith("@donkap.space")):
        raise HTTPException(403, "Not a demo account")


@router.post("/reset")
async def reset_demo_session(
    user: dict = Depends(get_current_user),
    profile: dict = Depends(get_current_profile),
):
    """Wipe today's activity for all users in the demo company so the next visitor starts fresh."""
    _assert_demo(user.get("email", ""))

    company_id = profile["company_id"]
    today = datetime.now(timezone.utc).date().isoformat()

    users_res = supabase.table("profiles").select("id").eq("company_id", company_id).execute()
    user_ids = [u["id"] for u in (users_res.data or [])]

    if user_ids:
        supabase.table("attendance").delete().in_("user_id", user_ids).eq("date", today).execute()
        for tbl in ("leave_requests", "overtime_requests", "attendance_corrections"):
            supabase.table(tbl).delete().in_("user_id", user_ids).gte("created_at", f"{today}T00:00:00+00:00").execute()

    return {"ok": True}
