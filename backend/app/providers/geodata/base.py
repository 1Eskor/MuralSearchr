from abc import abstractmethod
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from backend.app.providers.base import BaseProvider


class Coordinate(BaseModel):
    latitude: float
    longitude: float


class SamplePoint(BaseModel):
    id: str
    latitude: float
    longitude: float
    heading_along_road: Optional[float] = None
    road_name: Optional[str] = None
    distance_to_nearest_building_meters: Optional[float] = None


class RoadSegment(BaseModel):
    id: str
    name: Optional[str] = None
    highway_type: str
    coordinates: List[Coordinate]


class BuildingFootprint(BaseModel):
    id: str
    building_type: Optional[str] = None
    height_meters: Optional[float] = None
    coordinates: List[Coordinate]


class GeoDataProvider(BaseProvider):
    """
    Abstract interface for geographic data ingestion (roads, buildings, sampling).
    """

    @abstractmethod
    async def extract_roads(self, polygon_geojson: Dict[str, Any]) -> List[RoadSegment]:
        """Extract road network geometries inside a polygon."""
        pass

    @abstractmethod
    async def extract_buildings(self, polygon_geojson: Dict[str, Any]) -> List[BuildingFootprint]:
        """Extract building footprint geometries inside a polygon."""
        pass

    @abstractmethod
    async def generate_sample_points(
        self,
        polygon_geojson: Dict[str, Any],
        step_distance_meters: float = 20.0,
        max_building_distance_meters: float = 35.0,
        roads: Optional[List[RoadSegment]] = None,
        buildings: Optional[List[BuildingFootprint]] = None,
    ) -> List[SamplePoint]:
        """
        Generate candidate inspection coordinates along roads filtered by building proximity.
        """
        pass
