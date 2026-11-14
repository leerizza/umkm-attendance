import time
import base64
import hashlib
import json
import asyncio
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from db import supabase

bearer = HTTPBearer()

# ─── Simple in-memory JWT cache ───────────────────────────────────────────────
# Caches the Supabase Auth validation result per token so not every API request
# needs a round-trip to Supabase Auth. Kept short: a session revoked by logout
# (supabase.auth.signOut) is still accepted by this backend until the entry
# expires. An entry never outlives the token's own `exp`.
_auth_cache: dict[str, tuple[dict, float]] = {}
_AUTH_CACHE_TTL = 60  # 1 minute

_profile_cache: dict[str, tuple[dict, float]] = {}
_PROFILE_CACHE_TTL = 60  # 1 minute

_email_cache: dict[str, tuple[str | None, float]] = {}
_EMAIL_CACHE_TTL = 300  # 5 minutes

_CACHE_SOFT_LIMIT = 500   # above this, purge expired entries
_CACHE_HARD_LIMIT = 2000  # above this, also drop the oldest entries


def _prune(cache: dict) -> None:
    """Keep an in-memory cache bounded. Entries are (value, expire_ts)."""
    if len(cache) <= _CACHE_SOFT_LIMIT:
        return
    now = time.time()
    for k in [k for k, (_, exp) in list(cache.items()) if exp < now]:
        cache.pop(k, None)
    # Still too big (many live entries) → drop oldest-inserted (dicts keep order)
    overflow = len(cache) - _CACHE_HARD_LIMIT
    if overflow > 0:
        for k in list(cache.keys())[:overflow]:
            cache.pop(k, None)


def _token_exp(token: str) -> float | None:
    """Read the `exp` claim WITHOUT verifying the signature.

    Only used to shorten a cache TTL — never to authorize. The token itself is
    validated by Supabase Auth before it is ever cached.
    """
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        exp = json.loads(base64.urlsafe_b64decode(payload)).get("exp")
        return float(exp) if exp is not None else None
    except Exception:
        return None


def _token_key(token: str) -> str:
    """SHA-256 hash of the full token — collision-safe cache key."""
    return hashlib.sha256(token.encode()).hexdigest()


def _get_cached_user(token: str) -> dict | None:
    key = _token_key(token)
    entry = _auth_cache.get(key)
    if entry:
        user, expire = entry
        if time.time() < expire:
            return user
        _auth_cache.pop(key, None)
    return None


def _cache_user(token: str, user: dict):
    expire = time.time() + _AUTH_CACHE_TTL
    exp = _token_exp(token)
    if exp is not None:
        expire = min(expire, exp)
    if expire <= time.time():
        return
    _prune(_auth_cache)
    _auth_cache[_token_key(token)] = (user, expire)


def invalidate_token(token: str) -> None:
    _auth_cache.pop(_token_key(token), None)


async def _get_auth_email(user_id: str) -> str | None:
    entry = _email_cache.get(user_id)
    if entry:
        email, expire = entry
        if time.time() < expire:
            return email
    try:
        res = await asyncio.get_event_loop().run_in_executor(
            None, lambda: supabase.auth.admin.get_user_by_id(user_id)
        )
        email = res.user.email if res.user else None
    except Exception:
        email = None
    _prune(_email_cache)
    _email_cache[user_id] = (email, time.time() + _EMAIL_CACHE_TTL)
    return email


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


def _invalidate_profile_cache(user_id: str):
    _profile_cache.pop(user_id, None)


async def get_current_profile(user: dict = Depends(get_current_user)) -> dict:
    """Fetch full profile + company from DB, cached for 60s per user."""
    user_id = user["user_id"]
    entry = _profile_cache.get(user_id)
    if entry:
        profile, expire = entry
        if time.time() < expire:
            return profile

    try:
        res = (
            supabase.table("profiles")
            .select("*, companies(*)")
            .eq("id", user_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not res.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    if res.data.get("is_active") is False:
        _profile_cache.pop(user_id, None)
        raise HTTPException(status_code=403, detail="Akun Anda telah dinonaktifkan")
    company = res.data.get("companies") or {}
    if company.get("is_approved") is False:
        raise HTTPException(status_code=403, detail="pending_approval")

    _prune(_profile_cache)
    _profile_cache[user_id] = (res.data, time.time() + _PROFILE_CACHE_TTL)
    return res.data


async def require_admin(profile: dict = Depends(get_current_profile)) -> dict:
    if profile["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return profile
