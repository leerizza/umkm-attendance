from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request


def _get_user_or_ip(request: Request) -> str:
    """Rate limit by Bearer token (user identity) if present, else by IP."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        # Use first 32 chars of token as key (unique per session, avoids storing full JWT)
        return f"user:{token[:32]}"
    return get_remote_address(request)


limiter = Limiter(key_func=_get_user_or_ip, default_limits=["200/minute"])
