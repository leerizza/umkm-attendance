from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from db import supabase

bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    """
    Verify Supabase JWT using the Supabase admin SDK.
    Returns dict with: user_id, email
    """
    token = credentials.credentials
    try:
        res = supabase.auth.get_user(token)
        user = res.user
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"user_id": user.id, "email": user.email}
    except Exception:
        raise HTTPException(status_code=401, detail="Token expired or invalid")


async def get_current_profile(user: dict = Depends(get_current_user)) -> dict:
    """Fetch full profile + company from DB."""
    res = (
        supabase.table("profiles")
        .select("*, companies(*)")
        .eq("id", user["user_id"])
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return res.data


async def require_admin(profile: dict = Depends(get_current_profile)) -> dict:
    if profile["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return profile


async def require_superadmin(profile: dict = Depends(get_current_profile)) -> dict:
    if profile["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return profile
