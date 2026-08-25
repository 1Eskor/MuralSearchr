from abc import abstractmethod
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
from backend.app.providers.base import BaseProvider, ProviderInfo, ProviderStatus


class ExposureMetrics(BaseModel):
    """
    Traffic and pedestrian exposure metrics for a candidate wall location.
    """
    pedestrian_traffic_score: float = Field(default=0.5, ge=0.0, le=1.0)
    vehicle_traffic_score: float = Field(default=0.5, ge=0.0, le=1.0)
    transit_proximity_score: float = Field(default=0.5, ge=0.0, le=1.0)
    composite_exposure: float = Field(default=0.5, ge=0.0, le=1.0)
    data_source: str = "none"


class ExposureScoreProvider(BaseProvider):
    """
    Interface for future pedestrian foot traffic, road traffic volume,
    and public transit proximity scoring.
    """

    def get_info(self) -> ProviderInfo:
        return ProviderInfo(
            name="exposure_provider_stub",
            provider_type="exposure",
            description="Future interface for pedestrian traffic and transit exposure metrics",
            is_local=True,
            is_paid=False,
            status=ProviderStatus.NOT_CONFIGURED,
        )

    @abstractmethod
    async def evaluate_exposure(
        self,
        latitude: float,
        longitude: float,
        context: Optional[Dict[str, Any]] = None,
    ) -> ExposureMetrics:
        """
        Evaluate traffic and visibility exposure for a coordinate.
        """
        pass
