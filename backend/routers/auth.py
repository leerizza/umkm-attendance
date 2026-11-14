import asyncio
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
import httpx
from models.schemas import (
    RegisterRequest, RegisterCompanyRequest, LoginRequest,
    SendOTPRequest, VerifyOTPRequest,
    ResetPasswordOTPRequest, ChangePasswordOTPRequest,
    VerifyRegisterRequest, VerifyRegisterOwnerRequest,
)
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from utils.auth import bearer, get_current_profile, get_current_user, _invalidate_profile_cache, invalidate_token
from utils.email import send_new_company_notification
from db import supabase, db_run
from config import settings
from limiter import limiter, ip_key


class RefreshRequest(BaseModel):
    refresh_token: str


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    position: str | None = None


class ChangePasswordRequest(BaseModel):
    new_password: str

router = APIRouter(prefix="/auth", tags=["auth"])

_optional_bearer = HTTPBearer(auto_error=False)


@router.post("/register")
@limiter.limit("5/minute", key_func=ip_key)
async def register(request: Request, body: RegisterRequest):
    # 1. Validate company code
    try:
        company_res = await db_run(
            supabase.table("companies")
            .select("id,name,code")
            .eq("code", body.company_code.upper())
            .single()
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
                profile_check = await db_run(supabase.table("profiles").select("id").eq("id", uid))
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
@limiter.limit("5/minute", key_func=ip_key)
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
        company_res = await db_run(
            supabase.table("companies")
            .select("id,name")
            .eq("code", body.company_code.upper())
            .single()
        )
        company = company_res.data
    except Exception:
        raise HTTPException(400, "Kode perusahaan tidak valid")

    # 3. Insert profile (idempotent — skip if already exists)
    existing = await db_run(supabase.table("profiles").select("id").eq("id", user_id))
    if not existing.data:
        await db_run(supabase.table("profiles").insert({
            "id": user_id,
            "company_id": company["id"],
            "full_name": body.full_name,
            "phone": body.phone,
            "position": body.position,
            "role": "employee",
        }))

    return {
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_at": data["expires_at"],
    }


@router.post("/register-company")
@limiter.limit("5/minute", key_func=ip_key)
async def register_company(request: Request, body: RegisterCompanyRequest):
    """Owner registers: create unconfirmed user + send OTP. Company created after OTP verified."""
    code = body.company_code.upper()

    # 1. Ensure company code is not already taken
    existing = await db_run(supabase.table("companies").select("id").eq("code", code))
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
@limiter.limit("5/minute", key_func=ip_key)
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
        existing = await db_run(supabase.table("companies").select("id").eq("code", code))
    except Exception as exc:
        logger.error("Company code check failed: %s", exc)
        raise HTTPException(500, "Gagal memeriksa kode perusahaan, coba lagi")
    if existing.data:
        raise HTTPException(400, "Kode perusahaan sudah dipakai, pilih kode lain")

    # 3. Create company
    try:
        company_res = await db_run(
            supabase.table("companies")
            .insert({"name": body.company_name, "code": code, "is_approved": False})
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
        existing_profile = await db_run(supabase.table("profiles").select("id").eq("id", user_id))
        if not existing_profile.data:
            await db_run(supabase.table("profiles").insert({
                "id": user_id,
                "company_id": company_id,
                "full_name": body.full_name,
                "phone": body.phone,
                "role": "admin",
            }))
    except Exception as exc:
        logger.error("Profile insert failed for user=%s: %s", user_id, exc)
        # Company was created; clean it up to keep state consistent
        try:
            await db_run(supabase.table("companies").delete().eq("id", company_id))
        except Exception:
            pass
        raise HTTPException(500, f"Gagal membuat profil admin: {exc}")

    # Notify superadmin about new company pending approval
    if settings.superadmin_email:
        import asyncio
        asyncio.create_task(send_new_company_notification(
            company_name=body.company_name,
            company_code=code,
            owner_email=body.email,
            owner_name=body.full_name,
            company_id=company_id,
        ))

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
        "company_code": code,
        "pending_approval": True,
    }


@router.post("/login")
@limiter.limit("10/minute", key_func=ip_key)
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
        err_body = resp.json()
        err_desc = (err_body.get("error_description") or err_body.get("msg") or "").lower()
        if "captcha" in err_desc:
            raise HTTPException(400, "captcha_required")
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
@limiter.limit("3/minute", key_func=ip_key)
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
@limiter.limit("5/minute", key_func=ip_key)
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
@limiter.limit("5/minute", key_func=ip_key)
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
@limiter.limit("5/minute", key_func=ip_key)
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
@limiter.limit("20/minute", key_func=ip_key)
async def refresh_token(request: Request, body: RefreshRequest):
    # Call GoTrue directly. Do NOT use supabase.auth.refresh_session() on the
    # shared service-role client: it fires TOKEN_REFRESHED, which makes the
    # client swap its Authorization header to this user's JWT — every later DB
    # query in the process would then run as that user (RLS) and break once the
    # token expires.
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.supabase_url}/auth/v1/token",
            params={"grant_type": "refresh_token"},
            headers={
                "apikey": settings.supabase_service_key,
                "Content-Type": "application/json",
            },
            json={"refresh_token": body.refresh_token},
            timeout=10.0,
        )

    if resp.status_code != 200:
        raise HTTPException(401, "Invalid refresh token")

    data = resp.json()
    return {
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_at": data["expires_at"],
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


@router.post("/logout")
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
):
    """Drop this token from the backend auth cache so it stops working here
    immediately. The Supabase session itself is revoked by the client via
    supabase.auth.signOut(). Always succeeds (idempotent, no token required)."""
    if credentials:
        invalidate_token(credentials.credentials)
    return {"message": "ok"}


# ─── SSO (OAuth via Supabase Auth, e.g. "Masuk dengan Google") ────────────────
# SSO is LOGIN-ONLY: it never creates a Donkap account or joins anyone to a
# company. Supabase Auth links a Google identity to the existing user that has
# the same verified email, so the user_id (and all attendance/leave data) stays
# the same. When no such user exists, Supabase still creates a bare auth user
# without a profile — /auth/sso/session deletes that user again.

_SSO_LOGIN_PROVIDERS = {"email", "phone"}  # identities created by Donkap's own sign-up


def _is_demo_email(email: str | None) -> bool:
    email = (email or "").lower()
    return email.startswith("demo.") and email.endswith("@donkap.space")


def _delete_if_sso_only_user(user_id: str) -> None:
    """Delete an auth user that was created purely by an SSO sign-in.

    Only called when the user has no profile. A user that also has an
    email/phone identity came from Donkap's own sign-up (e.g. registration
    whose OTP step was never finished) and is left alone.
    """
    import logging
    try:
        res = supabase.auth.admin.get_user_by_id(user_id)
        u = res.user
        if not u:
            return
        providers = {getattr(i, "provider", None) for i in (getattr(u, "identities", None) or [])}
        if providers and not (providers & _SSO_LOGIN_PROVIDERS):
            supabase.auth.admin.delete_user(user_id)
    except Exception as exc:  # cleanup is best-effort; the login is refused either way
        logging.getLogger(__name__).warning("SSO orphan cleanup failed for %s: %s", user_id, exc)


@router.post("/sso/session")
@limiter.limit("10/minute", key_func=ip_key)
async def sso_session(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    user: dict = Depends(get_current_user),
):
    """Finish an SSO login: called by the app right after the OAuth redirect.

    Returns the profile (same shape as /auth/me) when the SSO email belongs to a
    registered Donkap account. Otherwise 403 `sso_not_registered`, and the
    stray auth user Supabase created for that email is removed.
    """
    if _is_demo_email(user.get("email")):
        raise HTTPException(403, "Akun demo tidak bisa login dengan SSO")

    existing = await db_run(supabase.table("profiles").select("id").eq("id", user["user_id"]))
    if not existing.data:
        invalidate_token(credentials.credentials)
        await asyncio.to_thread(_delete_if_sso_only_user, user["user_id"])
        raise HTTPException(403, "sso_not_registered")

    # Same gates as every other request: deactivated user / unapproved company
    return await get_current_profile(user)


@router.get("/me")
def get_me(profile: dict = Depends(get_current_profile)):
    """Return current user's profile + company."""
    return profile


@router.patch("/profile/me")
def update_profile(
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
    _invalidate_profile_cache(profile["id"])
    return {"message": "Profile updated", "data": res.data[0] if res.data else updates}
