from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
import httpx
from models.schemas import RegisterRequest, RegisterCompanyRequest, LoginRequest
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


class ChangePasswordRequest(BaseModel):
    new_password: str

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

    # 2. Create Supabase auth user via Admin REST API directly
    #    (more reliable than SDK admin.create_user which can fail with "user not allowed"
    #    depending on Supabase project auth settings)
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.supabase_url}/auth/v1/admin/users",
            headers={
                "apikey": settings.supabase_service_key,
                "Authorization": f"Bearer {settings.supabase_service_key}",
            },
            json={
                "email": body.email,
                "password": body.password,
                "email_confirm": True,
            },
            timeout=10.0,
        )

    if resp.status_code not in (200, 201):
        data = resp.json()
        msg = (
            data.get("msg")
            or data.get("message")
            or data.get("error_description")
            or data.get("error")
            or "Registration failed"
        )
        raise HTTPException(400, msg)

    user_id = resp.json()["id"]

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


@router.post("/register-company")
@limiter.limit("5/minute")
async def register_company(request: Request, body: RegisterCompanyRequest):
    """Owner / admin registers a new company and their own account in one step."""
    code = body.company_code.upper()

    # 1. Ensure company code is not already taken
    existing = (
        supabase.table("companies")
        .select("id")
        .eq("code", code)
        .execute()
    )
    if existing.data:
        raise HTTPException(400, "Kode perusahaan sudah dipakai, pilih kode lain")

    # 2. Create company
    company_res = (
        supabase.table("companies")
        .insert({"name": body.company_name, "code": code})
        .select("id")
        .execute()
    )
    if not company_res.data:
        raise HTTPException(500, "Gagal membuat perusahaan")
    company_id = company_res.data[0]["id"]

    # 3. Create auth user
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.supabase_url}/auth/v1/admin/users",
            headers={
                "apikey": settings.supabase_service_key,
                "Authorization": f"Bearer {settings.supabase_service_key}",
            },
            json={"email": body.email, "password": body.password, "email_confirm": True},
            timeout=10.0,
        )

    if resp.status_code not in (200, 201):
        # Roll back company creation
        supabase.table("companies").delete().eq("id", company_id).execute()
        data = resp.json()
        msg = data.get("msg") or data.get("message") or data.get("error_description") or "Gagal membuat akun"
        raise HTTPException(400, msg)

    user_id = resp.json()["id"]

    # 4. Insert profile as admin
    supabase.table("profiles").insert({
        "id": user_id,
        "company_id": company_id,
        "full_name": body.full_name,
        "phone": body.phone,
        "role": "admin",
    }).execute()

    return {
        "message": "Perusahaan dan akun admin berhasil dibuat",
        "company": body.company_name,
        "company_code": code,
    }


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


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    profile: dict = Depends(get_current_profile),
):
    async with httpx.AsyncClient() as client:
        resp = await client.put(
            f"{settings.supabase_url}/auth/v1/admin/users/{profile['id']}",
            headers={
                "apikey": settings.supabase_service_key,
                "Authorization": f"Bearer {settings.supabase_service_key}",
            },
            json={"password": body.new_password},
            timeout=10.0,
        )
    if resp.status_code not in (200, 201):
        data = resp.json()
        msg = data.get("msg") or data.get("message") or data.get("error_description") or "Gagal mengubah password"
        raise HTTPException(400, msg)
    return {"message": "Password berhasil diubah"}


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
        .select()
        .execute()
    )
    return {"message": "Profile updated", "data": res.data[0] if res.data else updates}
