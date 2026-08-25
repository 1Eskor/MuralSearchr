import os
import platform
from functools import lru_cache
from pathlib import Path
from typing import List, Literal
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Base directory for the repository
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent


class Settings(BaseSettings):
    """
    Application Settings loaded from environment variables and .env file.
    """
    model_config = SettingsConfigDict(
        env_file=(BASE_DIR / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # General
    APP_NAME: str = "Mural Search"
    APP_ENV: Literal["development", "production", "testing"] = "development"
    DEBUG: bool = True
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # Database
    DATABASE_URL: str = f"sqlite+aiosqlite:///{BASE_DIR}/data/mural_search.db"

    # File Storage & Cache
    CACHE_DIR: Path = Field(default=BASE_DIR / "data" / "cache")
    MAX_CACHE_SIZE_MB: int = 5000

    # Device Acceleration (auto, mps, cuda, cpu)
    DEVICE_PREFERENCE: str = "auto"

    # Active Provider Selections
    GEODATA_PROVIDER: str = "osm"
    IMAGERY_PROVIDER: str = "mapillary"
    VISION_RANKER_PROVIDER: str = "mock"
    VISION_ANALYZER_PROVIDER: str = "mock"
    EXPOSURE_PROVIDER: str = "none"

    # Optional Cloud / API Provider Keys
    MAPILLARY_CLIENT_TOKEN: str = ""
    OPENAI_API_KEY: str = ""
    OPENAI_ENABLED: bool = False
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Scoring Engine Weights (Defaults: W=30%, B=25%, V=20%, A=15%, C=10%)
    WEIGHT_WALL: float = 0.30
    WEIGHT_BLANKNESS: float = 0.25
    WEIGHT_VISIBILITY: float = 0.20
    WEIGHT_ACCESSIBILITY: float = 0.15
    WEIGHT_CONFIDENCE: float = 0.10

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    @field_validator("CACHE_DIR", mode="before")
    @classmethod
    def resolve_cache_dir(cls, v) -> Path:
        path = Path(v)
        if not path.is_absolute():
            path = (BASE_DIR / path).resolve()
        return path

    @property
    def detected_device(self) -> str:
        """
        Auto-detect the best available compute device for vision models.
        Supports Apple Silicon Metal (mps), Nvidia CUDA (cuda), and fallback CPU.
        """
        pref = self.DEVICE_PREFERENCE.lower()
        if pref in ("mps", "cuda", "cpu"):
            return pref

        try:
            import torch
            if torch.cuda.is_available():
                return "cuda"
            if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                return "mps"
        except ImportError:
            # PyTorch not yet installed in early phase, check OS platform
            if platform.system() == "Darwin" and platform.machine() == "arm64":
                return "mps"

        return "cpu"

    @property
    def scoring_weights(self) -> dict:
        """
        Returns normalized scoring weights dictionary.
        """
        total = (
            self.WEIGHT_WALL
            + self.WEIGHT_BLANKNESS
            + self.WEIGHT_VISIBILITY
            + self.WEIGHT_ACCESSIBILITY
            + self.WEIGHT_CONFIDENCE
        )
        if total <= 0:
            return {
                "wall": 0.30,
                "blankness": 0.25,
                "visibility": 0.20,
                "accessibility": 0.15,
                "confidence": 0.10,
            }
        return {
            "wall": self.WEIGHT_WALL / total,
            "blankness": self.WEIGHT_BLANKNESS / total,
            "visibility": self.WEIGHT_VISIBILITY / total,
            "accessibility": self.WEIGHT_ACCESSIBILITY / total,
            "confidence": self.WEIGHT_CONFIDENCE / total,
        }


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached application settings instance.
    """
    settings = Settings()
    # Ensure cache and data directories exist
    settings.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (BASE_DIR / "data").mkdir(parents=True, exist_ok=True)
    return settings
