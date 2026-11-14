"""Admin invitations: invite an email into the company, for "Masuk dengan Google".

The invited person joins by signing in with Google using exactly that email;
the profile is created in POST /auth/sso/session (routers/auth.py).
"""
import asyncio
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from db import supabase, db_run
from utils.auth import require_admin, _get_auth_email
from utils.audit import write_audit
from utils.email import send_invitation_email

router = APIRouter(prefix="/admin/invitations", tags=["admin"])

INVITE_TTL_DAYS = 30
MAX_PER_REQUEST = 50
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(v) -> datetime | None:
    if not v:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(v).replace("Z", "+00:00"))


def is_expired(inv: dict) -> bool:
    exp = _parse_ts(inv.get("expires_at"))
    return exp is not None and exp <= _now()


class InvitationCreateRequest(BaseModel):
    emails: list[str] = Field(min_length=1, max_length=MAX_PER_REQUEST)
    role: str = "employee"
    position: str | None = Field(default=None, max_length=100)

    @field_validator("emails")
    @classmethod
    def validate_emails(cls, v: list[str]) -> list[str]:
        out: list[str] = []
        for raw in v:
            e = normalize_email(raw)
            if not e:
                continue
            if len(e) > 254 or not _EMAIL_RE.match(e):
                raise ValueError(f"Email tidak valid: {raw}")
            if e not in out:
                out.append(e)
        if not out:
            raise ValueError("Isi minimal satu email")
        return out

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("employee", "admin"):
            raise ValueError("role harus 'employee' atau 'admin'")
        return v


def _public(inv: dict) -> dict:
    status = inv.get("status")
    if status == "pending" and is_expired(inv):
        status = "expired"
    return {
        "id": inv["id"],
        "email": inv["email"],
        "role": inv.get("role"),
        "position": inv.get("position"),
        "status": status,
        "expires_at": inv.get("expires_at"),
        "accepted_at": inv.get("accepted_at"),
        "created_at": inv.get("created_at"),
    }


@router.get("")
async def list_invitations(admin: dict = Depends(require_admin)):
    res = await db_run(
        supabase.table("invitations")
        .select("*")
        .eq("company_id", admin["company_id"])
        .neq("status", "revoked")
        .order("created_at", desc=True)
        .limit(200)
    )
    return {"data": [_public(r) for r in (res.data or [])]}


@router.post("")
async def create_invitations(body: InvitationCreateRequest, admin: dict = Depends(require_admin)):
    # Demo accounts are public — never let them send emails to arbitrary addresses
    admin_email = (await _get_auth_email(admin["id"]) or "").lower()
    if admin_email.startswith("demo.") and admin_email.endswith("@donkap.space"):
        raise HTTPException(403, "Fitur undangan tidak tersedia di mode demo")

    company = admin.get("companies") or {}
    expires_at = (_now() + timedelta(days=INVITE_TTL_DAYS)).isoformat()

    existing = await db_run(
        supabase.table("invitations")
        .select("id,email,company_id,expires_at")
        .in_("email", body.emails)
        .eq("status", "pending")
    )
    open_by_email = {r["email"]: r for r in (existing.data or [])}

    created, renewed, skipped = [], [], []
    for email in body.emails:
        inv = open_by_email.get(email)
        if inv and inv["company_id"] == admin["company_id"]:
            # Re-invite: refresh the expiry (also revives an expired one)
            res = await db_run(
                supabase.table("invitations")
                .update({"expires_at": expires_at, "role": body.role, "position": body.position})
                .eq("id", inv["id"])
                .eq("status", "pending")
            )
            if res.data:
                renewed.append(_public(res.data[0]))
            continue
        if inv and not is_expired(inv):
            # Open invitation from another company. Don't say which one.
            skipped.append({"email": email, "reason": "Sudah punya undangan aktif"})
            continue
        if inv:
            # Another company's invitation has expired — release the email
            await db_run(
                supabase.table("invitations")
                .update({"status": "revoked"})
                .eq("id", inv["id"])
                .eq("status", "pending")
            )
        try:
            res = await db_run(supabase.table("invitations").insert({
                "company_id": admin["company_id"],
                "email": email,
                "role": body.role,
                "position": body.position,
                "status": "pending",
                "invited_by": admin["id"],
                "expires_at": expires_at,
            }))
        except Exception:
            # Unique index on pending email — lost a race with another invite
            skipped.append({"email": email, "reason": "Sudah punya undangan aktif"})
            continue
        created.append(_public(res.data[0]))

    for inv in created + renewed:
        asyncio.create_task(send_invitation_email(
            to=inv["email"],
            company_name=company.get("name") or "perusahaan",
            inviter_name=admin.get("full_name") or "Admin",
        ))
    if created or renewed:
        await write_audit(
            "invite", "invitation", None, None,
            actor=admin,
            details={
                "emails": [i["email"] for i in created + renewed],
                "role": body.role,
                "company_name": company.get("name"),
            },
        )
    return {"created": created, "renewed": renewed, "skipped": skipped}


@router.delete("/{invitation_id}")
async def revoke_invitation(invitation_id: str, admin: dict = Depends(require_admin)):
    res = await db_run(
        supabase.table("invitations")
        .update({"status": "revoked"})
        .eq("id", invitation_id)
        .eq("company_id", admin["company_id"])
        .eq("status", "pending")
    )
    if not res.data:
        raise HTTPException(404, "Undangan tidak ditemukan atau sudah dipakai")
    await write_audit(
        "invite_revoke", "invitation", invitation_id, res.data[0].get("email"),
        actor=admin,
        details={"company_name": (admin.get("companies") or {}).get("name")},
    )
    return {"message": "Undangan dibatalkan"}
