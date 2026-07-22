from pydantic_settings import BaseSettings
from pydantic import model_validator
from functools import lru_cache

# Placeholder secret shipped in the repo — refuse to boot with it in production.
_INSECURE_SECRET = "CHANGE_ME_IN_PRODUCTION_use_openssl_rand_hex_32"


class Settings(BaseSettings):
    # App
    APP_NAME: str = "NexusChess"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://chess_user:chess_pass@postgres:5432/chess_db"

    # Redis
    REDIS_URL: str = "redis://redis:6379"

    # JWT
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_use_openssl_rand_hex_32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24       # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Stockfish
    STOCKFISH_PATH: str = "/usr/games/stockfish"

    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:80"]

    class Config:
        env_file = ".env"
        case_sensitive = True

    @model_validator(mode="after")
    def _validate_secret(self):
        """Refuse to boot with the shipped placeholder secret or a too-short key."""
        if self.SECRET_KEY == _INSECURE_SECRET:
            raise ValueError(
                "SECRET_KEY is still the insecure placeholder. "
                "Generate one with `openssl rand -hex 32` and set it in .env."
            )
        if len(self.SECRET_KEY) < 16:
            raise ValueError("SECRET_KEY must be at least 16 characters long.")
        return self


@lru_cache()
def get_settings() -> Settings:
    return Settings()
