from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from models.schemas import RegisterRequest, LoginRequest
from utils.auth import get_current_profile
from db import supabase
from config import settings
from gotrue.errors import AuthApiError
from limiter import limiter


class RefreshRequest(BaseModel):
    refresh_token: str


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    position: str | None = None

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest):
    # 1. Validate company code
    try:
        company_res = (
            supabase.table("companies")
            .select("id,name,code")
            .eq("code", body.company_code.upper())
            .single()
            .execute()
        )
        company = company_res.data
    except Exception:
        raise HTTPException(400, "Invalid company code")

    # 2. Create Supabase auth user
    try:
        auth_res = supabase.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,  # auto-confirm for UMKM simplicity
        })
    except AuthApiError as e:
        raise HTTPException(400, str(e))

    user_id = auth_res.user.id

    # 3. Insert profile
    supabase.table("profiles").insert({
        "id": user_id,
        "company_id": company["id"],
        "full_name": body.full_name,
        "phone": body.phone,
        "position": body.position,
        "role": "employee",
    }).execute()

    return {"message": "Registration successful", "company": company["name"]}


@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest):
    try:
        res = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except AuthApiError as e:
        raise HTTPException(401, "Invalid email or password")

    return {
        "access_token": res.session.access_token,
        "refresh_token": res.session.refresh_token,
        "expires_at": res.session.expires_at,
        "user": {
            "id": res.user.id,
            "email": res.user.email,
        },
    }


@router.post("/refresh")
async def refresh_token(body: RefreshRequest):
    try:
        res = supabase.auth.refresh_session(body.refresh_token)
    except AuthApiError:
        raise HTTPException(401, "Invalid refresh token")

    return {
        "access_token": res.session.access_token,
        "refresh_token": res.session.refresh_token,
        "expires_at": res.session.expires_at,
    }


@router.patch("/profile/me")
async def update_profile(
    body: ProfileUpdateRequest,
    profile: dict = Depends(get_current_profile),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    res = (
        supabase.table("profiles")
        .update(updates)
        .eq("id", profile["id"])
        .execute()
    )
    return {"message": "Profile updated", "data": res.data[0]}
