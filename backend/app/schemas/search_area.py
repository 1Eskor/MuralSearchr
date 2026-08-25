from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SamplePointDTO(BaseModel):
    id: str
    latitude: float
    longitude: float
    heading_along_road: Optional[float] = None
    road_name: Optional[str] = None
    distance_to_nearest_building_meters: Optional[float] = None


class ExtractionRequest(BaseModel):
    polygon_geojson: Dict[str, Any]
    step_distance_meters: float = Field(default=20.0, ge=5.0, le=100.0)
    max_building_distance_meters: float = Field(default=35.0, ge=5.0, le=150.0)
    provider: Optional[str] = None  # osm, mock


class ExtractionResult(BaseModel):
    total_roads: int
    total_buildings: int
    total_sample_points: int
    duration_seconds: float
    sample_points: List[SamplePointDTO]
    roads_geojson: Optional[Dict[str, Any]] = None
    buildings_geojson: Optional[Dict[str, Any]] = None


class SearchAreaCreate(BaseModel):
    name: str = "Search Area"
    polygon_geojson: Dict[str, Any]
    total_roads: int = 0
    total_buildings: int = 0
    sample_points_count: int = 0


class SearchAreaResponse(BaseModel):
    id: int
    name: str
    polygon_geojson: Dict[str, Any]
    status: str
    total_roads: int
    total_buildings: int
    sample_points_count: int
    created_at: datetime
    updated_at: datetime
