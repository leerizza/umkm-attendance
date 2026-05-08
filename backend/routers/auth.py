from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
import httpx
from models.schemas import (
    RegisterRequest, RegisterCompanyRequest, LoginRequest,
    SendOTPRequest, VerifyOTPRequest,
    ResetPasswordOTPRequest, ChangePasswordOTPRequest,
    VerifyRegisterRequest, VerifyRegisterOwnerRequest,
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
        raise HTTPException(400, "Kode perusahaan tidak ditemukan")

    # 2. Create confirmed auth user — profile NOT inserted yet (created after OTP).
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
        data = resp.json()
        err = (data.get("msg") or data.get("message") or data.get("error_description") or "").lower()
        if "already been registered" in err:
            # Check if profile already exists (completed registration before)
            async with httpx.AsyncClient() as client2:
                user_list = await client2.get(
                    f"{settings.supabase_url}/auth/v1/admin/users",
                    headers={
                        "apikey": settings.supabase_service_key,
                        "Authorization": f"Bearer {settings.supabase_service_key}",
                    },
                    params={"email": body.email},
                    timeout=10.0,
                )
            users = user_list.json().get("users", [])
            if users:
                uid = users[0]["id"]
                profile_check = supabase.table("profiles").select("id").eq("id", uid).execute()
                if profile_check.data:
                    raise HTTPException(400, "Email sudah terdaftar, silakan login")
                # No profile yet — update password to the one entered now, then resend OTP
                async with httpx.AsyncClient() as client3:
                    await client3.put(
                        f"{settings.supabase_url}/auth/v1/admin/users/{uid}",
                        headers={
                            "apikey": settings.supabase_service_key,
                            "Authorization": f"Bearer {settings.supabase_service_key}",
                            "Content-Type": "application/json",
                        },
                        json={"password": body.password},
                        timeout=10.0,
                    )
        else:
            raise HTTPException(400, data.get("msg") or data.get("message") or "Registrasi gagal")

    # 3. Send OTP for email verification
    async with httpx.AsyncClient() as client:
        otp_resp = await client.post(
            f"{settings.supabase_url}/auth/v1/otp",
            headers={"apikey": settings.supabase_service_key, "Content-Type": "application/json"},
            json={
                "email": body.email,
                "create_user": False,
                **({"gotrue_meta_security": {"captcha_token": body.captcha_token}} if body.captcha_token else {}),
            },
            timeout=8.0,
        )
    if otp_resp.status_code not in (200, 204):
        raise HTTPException(400, "Gagal mengirim OTP, coba lagi")

    return {"message": "OTP terkirim ke email", "company": company["name"]}


@router.post("/verify-register")
@limiter.limit("5/minute")
async def verify_register(request: Request, body: VerifyRegisterRequest):
    """Verify OTP then create employee profile — completes registration."""
    # 1. Verify OTP
    async with httpx.AsyncClient() as client:
        verify = await client.post(
            f"{settings.supabase_url}/auth/v1/verify",
            headers={"apikey": settings.supabase_service_key, "Content-Type": "application/json"},
            json={"email": body.email, "token": body.token, "type": "email"},
            timeout=10.0,
        )
    if verify.status_code != 200:
        raise HTTPException(401, "Kode OTP salah atau sudah kadaluarsa")

    data = verify.json()
    user_id = data["user"]["id"]

    # 2. Validate company code
    try:
        company_res = (
            supabase.table("companies")
            .select("id,name")
            .eq("code", body.company_code.upper())
            .single()
            .execute()
        )
        company = company_res.data
    except Exception:
        raise HTTPException(400, "Kode perusahaan tidak valid")

    # 3. Insert profile (idempotent — skip if already exists)
    existing = supabase.table("profiles").select("id").eq("id", user_id).execute()
    if not existing.data:
        supabase.table("profiles").insert({
            "id": user_id,
            "company_id": company["id"],
            "full_name": body.full_name,
            "phone": body.phone,
            "position": body.position,
            "role": "employee",
        }).execute()

    return {
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_at": data["expires_at"],
    }


@router.post("/register-company")
@limiter.limit("5/minute")
async def register_company(request: Request, body: RegisterCompanyRequest):
    """Owner registers: create unconfirmed user + send OTP. Company created after OTP verified."""
    code = body.company_code.upper()

    # 1. Ensure company code is not already taken
    existing = supabase.table("companies").select("id").eq("code", code).execute()
    if existing.data:
        raise HTTPException(400, "Kode perusahaan sudah dipakai, pilih kode lain")

    # 2. Create confirmed auth user — company/profile created after OTP.
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
        data = resp.json()
        err = (data.get("msg") or data.get("message") or data.get("error_description") or "").lower()
        if "already been registered" not in err:
            raise HTTPException(400, data.get("msg") or data.get("message") or "Gagal membuat akun")
        # Already exists but no company/profile yet — update password then resend OTP
        async with httpx.AsyncClient() as client2:
            user_list = await client2.get(
                f"{settings.supabase_url}/auth/v1/admin/users",
                headers={
                    "apikey": settings.supabase_service_key,
                    "Authorization": f"Bearer {settings.supabase_service_key}",
                },
                params={"email": body.email},
                timeout=10.0,
            )
        users = user_list.json().get("users", [])
        if users:
            uid = users[0]["id"]
            async with httpx.AsyncClient() as client3:
                await client3.put(
                    f"{settings.supabase_url}/auth/v1/admin/users/{uid}",
                    headers={
                        "apikey": settings.supabase_service_key,
                        "Authorization": f"Bearer {settings.supabase_service_key}",
                        "Content-Type": "application/json",
                    },
                    json={"password": body.password},
                    timeout=10.0,
                )

    # 3. Send OTP
    async with httpx.AsyncClient() as client:
        otp_resp = await client.post(
            f"{settings.supabase_url}/auth/v1/otp",
            headers={"apikey": settings.supabase_service_key, "Content-Type": "application/json"},
            json={
                "email": body.email,
                "create_user": False,
                **({"gotrue_meta_security": {"captcha_token": body.captcha_token}} if body.captcha_token else {}),
            },
            timeout=8.0,
        )
    if otp_resp.status_code not in (200, 204):
        raise HTTPException(400, "Gagal mengirim OTP, coba lagi")

    return {"message": "OTP terkirim ke email"}


@router.post("/verify-register-company")
@limiter.limit("5/minute")
async def verify_register_company(request: Request, body: VerifyRegisterOwnerRequest):
    """Verify OTP then create company + admin profile — completes owner registration."""
    import logging
    logger = logging.getLogger(__name__)
    code = body.company_code.upper()

    # 1. Verify OTP
    async with httpx.AsyncClient() as client:
        verify = await client.post(
            f"{settings.supabase_url}/auth/v1/verify",
            headers={"apikey": settings.supabase_service_key, "Content-Type": "application/json"},
            json={"email": body.email, "token": body.token, "type": "email"},
            timeout=10.0,
        )
    if verify.status_code != 200:
        raise HTTPException(401, "Kode OTP salah atau sudah kadaluarsa")

    data = verify.json()
    try:
        user_id = data["user"]["id"]
        access_token = data["access_token"]
        refresh_token = data["refresh_token"]
        expires_at = data["expires_at"]
    except (KeyError, TypeError) as exc:
        logger.error("Unexpected Supabase verify response: %s | error: %s", data, exc)
        raise HTTPException(500, "Respons verifikasi tidak valid, coba lagi")

    # 2. Check company code still available
    try:
        existing = supabase.table("companies").select("id").eq("code", code).execute()
    except Exception as exc:
        logger.error("Company code check failed: %s", exc)
        raise HTTPException(500, "Gagal memeriksa kode perusahaan, coba lagi")
    if existing.data:
        raise HTTPException(400, "Kode perusahaan sudah dipakai, pilih kode lain")

    # 3. Create company
    try:
        company_res = (
            supabase.table("companies")
            .insert({"name": body.company_name, "code": code})
            .execute()
        )
        if not company_res.data:
            raise HTTPException(500, "Gagal membuat perusahaan, coba lagi")
        company_id = company_res.data[0]["id"]
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Company insert failed for code=%s: %s", code, exc)
        raise HTTPException(500, f"Gagal membuat perusahaan: {exc}")

    # 4. Insert admin profile (idempotent)
    try:
        existing_profile = supabase.table("profiles").select("id").eq("id", user_id).execute()
        if not existing_profile.data:
            supabase.table("profiles").insert({
                "id": user_id,
                "company_id": company_id,
                "full_name": body.full_name,
                "phone": body.phone,
                "role": "admin",
            }).execute()
    except Exception as exc:
        logger.error("Profile insert failed for user=%s: %s", user_id, exc)
        # Company was created; clean it up to keep state consistent
        try:
            supabase.table("companies").delete().eq("id", company_id).execute()
        except Exception:
            pass
        raise HTTPException(500, f"Gagal membuat profil admin: {exc}")

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
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
            json={
                "email": body.email,
                "password": body.password,
                **({"gotrue_meta_security": {"captcha_token": body.captcha_token}} if body.captcha_token else {}),
            },
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
    """Send OTP to the user's email via Supabase."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.supabase_url}/auth/v1/otp",
            headers={
                "apikey": settings.supabase_service_key,
                "Content-Type": "application/json",
            },
            json={
                "email": body.email,
                "create_user": False,
                **({"gotrue_meta_security": {"captcha_token": body.captcha_token}} if body.captcha_token else {}),
            },
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
