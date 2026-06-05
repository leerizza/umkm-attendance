from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from limiter import limiter
from config import settings
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
        except Exception:
            origin = request.headers.get("origin", "*")
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"},
                headers={
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Credentials": "true",
                },
            )


app = FastAPI(
    title="Smart UMKM Attendance API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Smart UMKM Attendance"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
