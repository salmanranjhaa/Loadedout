from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "LoadedOut"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://loadedout_user:changeme@localhost:5432/loadedout_db"
    DATABASE_URL_SYNC: str = "postgresql+psycopg2://loadedout_user:changeme@localhost:5432/loadedout_db"

    # Auth
    SECRET_KEY: str = "change-this-to-a-long-random-string"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Cookies
    SECURE_COOKIES: bool = False
    COOKIE_DOMAIN: str = ""

    # CORS — comma-separated list of allowed origins
    # capacitor://localhost and http://localhost are required for the Android APK WebView
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000,capacitor://localhost,http://localhost,http://192.168.1.182:5173"

    # Google Cloud
    GCP_PROJECT_ID: str = ""
    GCP_REGION: str = "europe-west6"
    VERTEX_AI_MODEL: str = "gemini-2.0-flash-001"
    # Comma-separated fallback candidates tried if the primary model/region fails.
    VERTEX_AI_MODEL_FALLBACKS: str = "gemini-2.5-flash,gemini-1.5-flash"
    VERTEX_AI_FALLBACK_REGIONS: str = "us-central1"
    ENABLE_GROQ_FALLBACK: bool = True
    GROQ_API_KEY: str = ""
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_MODEL: str = "moonshotai/kimi-k2-instruct-0905"
    GROQ_MODEL_FALLBACKS: str = ""

    # Embeddings — using local sentence-transformers, no API key needed
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"

    # MongoDB
    MONGODB_URI: str = ""
    MONGODB_DB_NAME: str = "loadedout"

    # WorkoutX Exercise API
    WORKOUTX_API_KEY: str = ""

    # SMTP for password reset emails — reset flow degrades gracefully if unset
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "no-reply@loadedout.online"
    APP_PUBLIC_URL: str = "https://loadedout.online"

    # Google Calendar OAuth (web/server client — used for browser redirect flow)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8001/api/v1/auth/google/callback"
    # Native deep-link target for Capacitor app (used after OAuth callback)
    GOOGLE_NATIVE_REDIRECT_URI: str = "com.antigravity.loadedout://auth"
    # Native Google Sign-In client IDs (Android/iOS — registered in GCP OAuth console)
    GOOGLE_ANDROID_CLIENT_ID: str = ""
    GOOGLE_IOS_CLIENT_ID: str = ""

    def get_allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    def is_secret_key_placeholder(self) -> bool:
        return self.SECRET_KEY == "change-this-to-a-long-random-string"

    class Config:
        env_file = ".env"
        extra = "ignore"



@lru_cache()
def get_settings() -> Settings:
    return Settings()
