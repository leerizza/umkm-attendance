import asyncio
import logging

from db import supabase

_log = logging.getLogger(__name__)


async def write_audit(
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    entity_name: str | None = None,
    *,
    actor: dict | None = None,
    actor_name: str | None = None,
    company_id: str | None = None,
    details: dict | None = None,
) -> None:
    """Append an entry to audit_log. Never raises — auditing must not break the action.

    `actor` is a profile dict (from get_current_profile / require_admin); its
    id, full_name and company_id are recorded unless overridden.
    """
    row = {
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_name": entity_name,
        "actor_id": actor.get("id") if actor else None,
        "actor_name": actor_name or (actor.get("full_name") if actor else None),
        "company_id": company_id or (actor.get("company_id") if actor else None),
        "details": details,
    }
    try:
        await asyncio.to_thread(lambda: supabase.table("audit_log").insert(row).execute())
    except Exception as e:
        _log.error("Failed to write audit log (%s %s): %s", action, entity_id, e)
