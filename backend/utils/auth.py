import time
import asyncio
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from db import supabase

bearer = HTTPBearer()

# ─── Simple in-memory JWT cache ───────────────────────────────────────────────
# Caches Supabase Auth validation result for 5 minutes per token.
# Avoids an extra network round-trip to Supabase Auth on every API request.
_auth_cache: dict[str, tuple[dict, float]] = {}
_AUTH_CACHE_TTL = 300  # 5 minutes


def _get_cached_user(token: str) -> dict | None:
    key = token[-40:]  # last 40 chars of JWT signature — unique per token
    entry = _auth_cache.get(key)
    if entry:
        user, expire = entry
        if time.time() < expire:
            return user
        del _auth_cache[key]
    return None


def _cache_user(token: str, user: dict):
    key = token[-40:]
    # Evict expired entries if cache grows large
    if len(_auth_cache) > 500:
        now = time.time()
        for k in [k for k, (_, exp) in list(_auth_cache.items()) if exp < now]:
            _auth_cache.pop(k, None)
    _auth_cache[key] = (user, time.time() + _AUTH_CACHE_TTL)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    token = credentials.credentials

    # Check cache first
    cached = _get_cached_user(token)
    if cached:
        return cached

    try:
        # Run sync supabase SDK call in thread pool to avoid blocking the event loop
        res = await asyncio.get_event_loop().run_in_executor(
            None, lambda: supabase.auth.get_user(token)
        )
        user = res.user
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        result = {"user_id": user.id, "email": user.email}
        _cache_user(token, result)
        return result
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Token expired or invalid")


async def get_current_profile(user: dict = Depends(get_current_user)) -> dict:
    """Fetch full profile + company from DB."""
    try:
        res = (
            supabase.table("profiles")
            .select("*, companies(*)")
            .eq("id", user["user_id"])
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not res.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    if res.data.get("is_active") is False:
        raise HTTPException(status_code=403, detail="Akun Anda telah dinonaktifkan")
    return res.data


async def require_admin(profile: dict = Depends(get_current_profile)) -> dict:
    if profile["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return profile
