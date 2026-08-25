from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel


class ProviderStatus(str, Enum):
    AVAILABLE = "available"
    CONFIGURED = "configured"
    NOT_CONFIGURED = "not_configured"
    FALLBACK = "fallback"
    ERROR = "error"


class ProviderInfo(BaseModel):
    name: str
    provider_type: str  # geodata, imagery, vision_ranker, vision_analyzer, exposure
    description: str
    is_local: bool = True
    is_paid: bool = False
    status: ProviderStatus = ProviderStatus.CONFIGURED
    status_message: Optional[str] = None


class BaseProvider(ABC):
    """
    Abstract base provider class defining lifecycle and health check interfaces.
    """

    @abstractmethod
    def get_info(self) -> ProviderInfo:
        """Return provider metadata, status, and capabilities."""
        pass

    async def initialize(self) -> None:
        """Asynchronous initialization (load models, verify keys, connect clients)."""
        pass

    async def health_check(self) -> bool:
        """Verify provider availability and operational readiness."""
        return True
