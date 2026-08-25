from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from backend.app.schemas.search_area import SamplePointDTO


class ImageryDTO(BaseModel):
    id: int
    provider: str
    external_id: Optional[str] = None
    latitude: float
    longitude: float
    heading: Optional[float] = None
    pitch: Optional[float] = None
    capture_date: Optional[datetime] = None
    source_url: Optional[str] = None
    local_path: Optional[str] = None
    file_hash: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    is_cached: bool = False
    preview_url: str
    metadata_json: Optional[Dict[str, Any]] = None
    created_at: datetime


class ImageryIngestRequest(BaseModel):
    search_area_id: Optional[int] = None
    sample_points: Optional[List[SamplePointDTO]] = None
    polygon_geojson: Optional[Dict[str, Any]] = None
    max_images_per_point: int = Field(default=2, ge=1, le=5)
    radius_meters: float = Field(default=25.0, ge=10.0, le=100.0)
    provider: Optional[str] = "mapillary"


class ImageryIngestResult(BaseModel):
    job_id: str
    status: str
    total_points_queried: int
    total_images_ingested: int
    total_bytes_cached: int
    duration_seconds: float
    images: List[ImageryDTO]


class ImageryStats(BaseModel):
    total_images: int
    cached_images: int
    total_storage_mb: float
    active_provider: str
    is_live_api_active: bool
    status_message: str
