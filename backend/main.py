import re
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from limiter import limiter
from config import settings

_log = logging.getLogger(__name__)


async def _cleanup_sick_notes_loop() -> None:
    """Hapus file surat sakit dari rejected/cancelled leaves yang lebih dari 7 hari."""
    while True:
        try:
            from db import supabase
            cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            res = (
                supabase.table("leave_requests")
                .select("id, attachment_url")
                .in_("status", ["rejected", "cancelled"])
                .not_.is_("attachment_url", "null")
                .lte("created_at", cutoff)
                .execute()
            )
            cleaned = 0
            for row in (res.data or []):
                path = row.get("attachment_url")
                if path:
                    try:
                        supabase.storage.from_("sick-notes").remove([path])
                        supabase.table("leave_requests").update({"attachment_url": None}).eq("id", row["id"]).execute()
                        cleaned += 1
                    except Exception as e:
                        _log.warning("cleanup_sick_notes: gagal hapus %s: %s", path, e)
            if cleaned:
                _log.info("cleanup_sick_notes: %d file terhapus", cleaned)
        except Exception as e:
            _log.warning("cleanup_sick_notes: error: %s", e)
        await asyncio.sleep(86400)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_cleanup_sick_notes_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

_VERCEL_ORIGIN_RE = re.compile(r"^https://.*\.vercel\.app$")


def _is_allowed_origin(origin: str | None) -> bool:
    if not origin:
        return False
    return origin in settings.allowed_origins or bool(_VERCEL_ORIGIN_RE.match(origin))

# Init Sentry before importing routers so router-level exceptions get captured.
if settings.sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

from routers import auth, attendance, leave, overtime, admin, corrections, superadmin, analytics, demo, locations


# ─── CORS error fallback middleware ───────────────────────────────────────────
# Starlette's ServerErrorMiddleware sits OUTSIDE CORSMiddleware, so any
# unhandled exception that escapes all route/exception handlers never gets
# CORS headers — the browser sees ERR_FAILED instead of a proper 500.
# This middleware wraps the entire app and injects CORS headers on any error
# response, regardless of where the exception originated.
class CORSErrorMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        from fastapi import HTTPException as FastAPIHTTPException
        try:
            response = await call_next(request)
            return response
        except FastAPIHTTPException:
            raise  # let FastAPI's ExceptionMiddleware handle it with proper status + CORS
        except Exception as exc:
            if settings.sentry_dsn:
                import sentry_sdk
                sentry_sdk.capture_exception(exc)
            origin = request.headers.get("origin")
            headers = {}
            if _is_allowed_origin(origin):
                headers["Access-Control-Allow-Origin"] = origin
                headers["Access-Control-Allow-Credentials"] = "true"
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"},
                headers=headers,
            )


app = FastAPI(
    title="Smart UMKM Attendance API",
    version="1.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── CORS ─────────────────────────────────────────────────────────────────────
# Order matters: CORSErrorMiddleware must be added LAST (outermost layer).
# add_middleware() prepends, so the last call = outermost wrapper.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",  # all Vercel preview/branch deployments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(CORSErrorMiddleware)  # outermost — catches anything CORSMiddleware missed

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(attendance.router)
app.include_router(leave.router)
app.include_router(overtime.router)
app.include_router(admin.router)
app.include_router(corrections.router)
app.include_router(superadmin.router)
app.include_router(analytics.router)
app.include_router(demo.router)
app.include_router(locations.router)


@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    return {"status": "ok", "service": "Smart UMKM Attendance"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
