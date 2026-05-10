from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_key: str

    # Comma-separated list of allowed frontend origins.
    # Example: https://myapp.vercel.app,https://myapp-git-main-user.vercel.app
    frontend_url: str = "https://umkm-attendance-1-1.vercel.app"

    resend_api_key: str = ""
    from_email: str = "Donkap <noreply@donkap.id>"

    @property
    def allowed_origins(self) -> List[str]:
        origins = [o.strip() for o in self.frontend_url.split(",") if o.strip()]
        # Always allow local dev
        if "http://localhost:5173" not in origins:
            origins.append("http://localhost:5173")
        return origins

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
