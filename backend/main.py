from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from limiter import limiter
from config import settings
from routers import auth, attendance, leave, overtime, admin, superadmin

app = FastAPI(
    title="Smart UMKM Attendance API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── CORS ─────────────────────────────────────────────────────────────────────
# Must be added BEFORE the global exception handler so CORS headers are always
# present — even on 500 responses where the route crashes before sending headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Global exception handler ─────────────────────────────────────────────────
# Converts any unhandled exception into a JSON 500 so the CORSMiddleware can
# attach Access-Control-Allow-Origin (otherwise the browser sees ERR_FAILED).
@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(attendance.router)
app.include_router(leave.router)
app.include_router(overtime.router)
app.include_router(admin.router)
app.include_router(superadmin.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Smart UMKM Attendance"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
