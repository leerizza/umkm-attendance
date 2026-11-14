from slowapi import Limiter
from fastapi import Request


def client_ip(request: Request) -> str:
    """Real client IP behind Railway's edge proxy.

    Railway's HTTP edge sets (and overwrites) `X-Real-IP` with the client's
    address; `request.client.host` would be the proxy's internal IP, putting
    every user in one bucket. Falls back to the socket peer for local dev.
    """
    real_ip = request.headers.get("X-Real-IP", "").strip()
    if real_ip:
        return real_ip
    return request.client.host if request.client else "unknown"


def _get_user_or_ip(request: Request) -> str:
    """Rate limit by user_id for already-validated tokens, else by IP.

    Only tokens present in the auth cache (i.e. verified with Supabase by a
    previous request) are trusted as identity. An arbitrary/forged Bearer header
    therefore falls back to IP limiting and cannot be used to get a fresh bucket.
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        from utils.auth import _get_cached_user  # lazy: avoid import cycle / db init

        user = _get_cached_user(auth[7:])
        if user:
            return f"user:{user['user_id']}"
    return f"ip:{client_ip(request)}"


def ip_key(request: Request) -> str:
    """Key for public auth endpoints (login, OTP, register) — always by IP."""
    return f"ip:{client_ip(request)}"


limiter = Limiter(key_func=_get_user_or_ip, default_limits=["200/minute"])
