from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
import httpx
from models.schemas import (
    RegisterRequest, RegisterCompanyRequest, LoginRequest,
    SendOTPRequest, VerifyOTPRequest,
    ResetPasswordOTPRequest, ChangePasswordOTPRequest,
)
from utils.auth import get_current_profile, get_current_user
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

    # 4. Send OTP for email verification (best-effort, don't fail registration if this errors)
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{settings.supabase_url}/auth/v1/otp",
                headers={"apikey": settings.supabase_service_key, "Content-Type": "application/json"},
                json={"email": body.email, "create_user": False},
                timeout=8.0,
            )
    except Exception:
        pass

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

    # 5. Send OTP for email verification (best-effort)
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{settings.supabase_url}/auth/v1/otp",
                headers={"apikey": settings.supabase_service_key, "Content-Type": "application/json"},
                json={"email": body.email, "create_user": False},
                timeout=8.0,
            )
    except Exception:
        pass

    return {
        "message": "Perusahaan dan akun admin berhasil dibuat",
        "company": body.company_name,
        "company_code": code,
    }


@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest):
    # Use httpx (async) instead of supabase-py SDK (sync) to avoid blocking
    # the event loop — sync SDK calls on Railway caused 499 proxy timeouts on mobile
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.supabase_url}/auth/v1/token",
            params={"grant_type": "password"},
            headers={
                "apikey": settings.supabase_service_key,
                "Content-Type": "application/json",
            },
            json={"email": body.email, "password": body.password},
            timeout=10.0,
        )

    if resp.status_code != 200:
        raise HTTPException(401, "Email atau password salah")

    data = resp.json()
    return {
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_at":   data["expires_at"],
        "user": {
            "id":    data["user"]["id"],
            "email": data["user"]["email"],
        },
    }


@router.post("/send-otp")
@limiter.limit("3/minute")
async def send_otp(request: Request, body: SendOTPRequest):
    """Send a 6-digit OTP to the user's email via Supabase."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.supabase_url}/auth/v1/otp",
            headers={
                "apikey": settings.supabase_service_key,
                "Content-Type": "application/json",
            },
            json={"email": body.email, "create_user": False},
            timeout=10.0,
        )

    # Supabase returns 200/204 on success; 422 if email not found
    if resp.status_code not in (200, 204):
        detail = resp.json().get("msg") or resp.json().get("message") or "Email tidak terdaftar"
        raise HTTPException(400, detail)

    return {"message": "OTP terkirim ke email"}


@router.post("/verify-otp")
@limiter.limit("5/minute")
async def verify_otp(request: Request, body: VerifyOTPRequest):
    """Verify a 6-digit OTP and return a session."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.supabase_url}/auth/v1/verify",
            headers={
                "apikey": settings.supabase_service_key,
                "Content-Type": "application/json",
            },
            json={"email": body.email, "token": body.token, "type": "email"},
            timeout=10.0,
        )

    if resp.status_code != 200:
        raise HTTPException(401, "Kode OTP salah atau sudah kadaluarsa")

    data = resp.json()
    return {
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_at":   data["expires_at"],
        "user": {
            "id":    data["user"]["id"],
            "email": data["user"]["email"],
        },
    }


@router.post("/reset-password-otp")
@limiter.limit("5/minute")
async def reset_password_otp(request: Request, body: ResetPasswordOTPRequest):
    """Verify OTP then reset password — used by forgot-password flow."""
    # 1. Verify OTP → get session + user_id
    async with httpx.AsyncClient() as client:
        verify = await client.post(
            f"{settings.supabase_url}/auth/v1/verify",
            headers={"apikey": settings.supabase_service_key, "Content-Type": "application/json"},
            json={"email": body.email, "token": body.token, "type": "email"},
            timeout=10.0,
        )
    if verify.status_code != 200:
        raise HTTPException(401, "Kode OTP salah atau sudah kadaluarsa")

    user_id = verify.json()["user"]["id"]

    # 2. Update password via admin API
    async with httpx.AsyncClient() as client:
        pwd = await client.put(
            f"{settings.supabase_url}/auth/v1/admin/users/{user_id}",
            headers={
                "apikey": settings.supabase_service_key,
                "Authorization": f"Bearer {settings.supabase_service_key}",
                "Content-Type": "application/json",
            },
            json={"password": body.new_password},
            timeout=10.0,
        )
    if pwd.status_code not in (200, 201):
        raise HTTPException(500, "Gagal mereset password, coba lagi")

    return {"message": "Password berhasil direset"}


@router.post("/change-password-otp")
@limiter.limit("5/minute")
async def change_password_otp(
    request: Request,
    body: ChangePasswordOTPRequest,
    user: dict = Depends(get_current_user),
):
    """Verify OTP then change password — used by logged-in users."""
    # 1. Verify OTP
    async with httpx.AsyncClient() as client:
        verify = await client.post(
            f"{settings.supabase_url}/auth/v1/verify",
            headers={"apikey": settings.supabase_service_key, "Content-Type": "application/json"},
            json={"email": user["email"], "token": body.token, "type": "email"},
            timeout=10.0,
        )
    if verify.status_code != 200:
        raise HTTPException(401, "Kode OTP salah atau sudah kadaluarsa")

    # 2. Update password via admin API
    async with httpx.AsyncClient() as client:
        pwd = await client.put(
            f"{settings.supabase_url}/auth/v1/admin/users/{user['user_id']}",
            headers={
                "apikey": settings.supabase_service_key,
                "Authorization": f"Bearer {settings.supabase_service_key}",
                "Content-Type": "application/json",
            },
            json={"password": body.new_password},
            timeout=10.0,
        )
    if pwd.status_code not in (200, 201):
        raise HTTPException(500, "Gagal mengubah password, coba lagi")

    return {"message": "Password berhasil diubah"}


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


@router.get("/me")
async def get_me(profile: dict = Depends(get_current_profile)):
    """Return current user's profile + company."""
    return profile


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
