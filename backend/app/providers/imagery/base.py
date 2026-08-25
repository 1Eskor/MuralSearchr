import datetime
from abc import abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from backend.app.providers.base import BaseProvider


class StreetImageMetadata(BaseModel):
    id: str
    provider: str
    latitude: float
    longitude: float
    heading: Optional[float] = None
    pitch: Optional[float] = None
    capture_date: Optional[datetime.datetime] = None
    source_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    is_panoramic: bool = False
    extra_metadata: Optional[Dict[str, Any]] = None


class ImageryProvider(BaseProvider):
    """
    Abstract interface for street imagery retrieval and ingestion.
    """

    @abstractmethod
    async def query_images_near_coordinates(
        self,
        lat: float,
        lon: float,
        radius_meters: float = 25.0,
        max_images: int = 5,
    ) -> List[StreetImageMetadata]:
        """
        Query available street imagery around a specific latitude/longitude.
        """
        pass

    @abstractmethod
    async def download_image(
        self,
        image_meta: StreetImageMetadata,
        destination_path: Path,
    ) -> Path:
        """
        Download/retrieve street image and save to destination path.
        """
        pass
