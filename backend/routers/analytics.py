from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Literal
from db import supabase
from limiter import limiter

router = APIRouter(prefix="/analytics", tags=["analytics"])


class EventRequest(BaseModel):
    event_type: Literal["page_view", "demo_login", "register_company", "register_employee"]
    source: str = "main"


@router.post("/event")
@limiter.limit("60/minute")
async def track_event(request: Request, body: EventRequest):
    """Record an analytics event. Public endpoint — no auth required."""
    try:
        supabase.table("analytics_events").insert({
            "event_type": body.event_type,
            "source": body.source,
        }).execute()
    except Exception:
        pass  # fire-and-forget: never fail the caller
    return {"ok": True}
