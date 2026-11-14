from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_key: str

    # Comma-separated list of allowed frontend origins.
    # Example: https://myapp.vercel.app,https://myapp-git-main-user.vercel.app
    frontend_url: str = "https://umkm-attendance-1-1.vercel.app"

    resend_api_key: str = ""
    from_email: str = "Donkap <noreply@donkap.space>"

    superadmin_key: str = ""
    superadmin_email: str = ""

    # Swagger /docs, /redoc & /openapi.json — off by default (production).
    # Set ENABLE_DOCS=true for local dev / staging.
    enable_docs: bool = False

    sentry_dsn: str = ""
    sentry_environment: str = "production"

    @property
    def allowed_origins(self) -> List[str]:
        origins = [o.strip() for o in self.frontend_url.split(",") if o.strip()]
        # Always allow all known Donkap domains + local dev
        always = [
            "http://localhost:5173",
            "https://localhost",
            "capacitor://localhost",
            "https://donkap.space",
            "https://www.donkap.space",
            "https://site.donkap.space",
            "https://demo.donkap.space",
            "https://admin.donkap.space",
        ]
        for o in always:
            if o not in origins:
                origins.append(o)
        return origins

    # Vercel preview/branch deployments of our own team only, plus production
    # *.vercel.app aliases of our projects. (Was: any *.vercel.app.)
    vercel_origin_regex: str = (
        r"https://("
        r"[a-z0-9-]+-riza-gumelars-projects"
        r"|umkm-attendance|umkm-attendance-1-1|umkm-attendance-admin|umkm-attendance-landing"
        r")\.vercel\.app"
    )

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
