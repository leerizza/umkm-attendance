from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_key: str

    # Comma-separated list of allowed frontend origins.
    # Example: https://myapp.vercel.app,https://myapp-git-main-user.vercel.app
    frontend_url: str = "https://umkm-attendance-silk.vercel.app/"
    #frontend_url_dev: str = "http://localhost:5173"

    @property
    def allowed_origins(self) -> List[str]:
        origins = [o.strip() for o in self.frontend_url.split(",") if o.strip()]
        # Always allow local dev
        if "https://umkm-attendance-silk.vercel.app/" not in origins:
            origins.append("https://umkm-attendance-silk.vercel.app/")
        return origins

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
