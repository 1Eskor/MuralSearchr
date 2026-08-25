import math
import uuid
from typing import Any, Dict, List
from backend.app.providers.base import ProviderInfo, ProviderStatus
from backend.app.providers.geodata.base import (
    BuildingFootprint,
    Coordinate,
    GeoDataProvider,
    RoadSegment,
    SamplePoint,
)


class MockGeoProvider(GeoDataProvider):
    """
    Mock Geodata Provider for testing, CI, and Phase 1 offline verification.
    Generates synthetic road grids and candidate sampling coordinates.
    """

    def get_info(self) -> ProviderInfo:
        return ProviderInfo(
            name="mock_geodata",
            provider_type="geodata",
            description="Mock OpenStreetMap/Overpass provider for offline development & tests",
            is_local=True,
            is_paid=False,
            status=ProviderStatus.AVAILABLE,
        )

    async def extract_roads(self, polygon_geojson: Dict[str, Any]) -> List[RoadSegment]:
        # Center coordinates or default around downtown test grid
        coords = self._extract_centroid(polygon_geojson)
        base_lat, base_lon = coords["lat"], coords["lon"]

        roads = [
            RoadSegment(
                id="mock_road_1",
                name="Main Street",
                highway_type="primary",
                coordinates=[
                    Coordinate(latitude=base_lat - 0.002, longitude=base_lon - 0.002),
                    Coordinate(latitude=base_lat + 0.002, longitude=base_lon - 0.002),
                ],
            ),
            RoadSegment(
                id="mock_road_2",
                name="Market Avenue",
                highway_type="secondary",
                coordinates=[
                    Coordinate(latitude=base_lat, longitude=base_lon - 0.003),
                    Coordinate(latitude=base_lat, longitude=base_lon + 0.003),
                ],
            ),
        ]
        return roads

    async def extract_buildings(self, polygon_geojson: Dict[str, Any]) -> List[BuildingFootprint]:
        coords = self._extract_centroid(polygon_geojson)
        base_lat, base_lon = coords["lat"], coords["lon"]

        return [
            BuildingFootprint(
                id="mock_bldg_1",
                building_type="commercial",
                height_meters=12.5,
                coordinates=[
                    Coordinate(latitude=base_lat + 0.0005, longitude=base_lon + 0.0005),
                    Coordinate(latitude=base_lat + 0.0005, longitude=base_lon + 0.0015),
                    Coordinate(latitude=base_lat + 0.0015, longitude=base_lon + 0.0015),
                    Coordinate(latitude=base_lat + 0.0015, longitude=base_lon + 0.0005),
                ],
            ),
            BuildingFootprint(
                id="mock_bldg_2",
                building_type="industrial",
                height_meters=8.0,
                coordinates=[
                    Coordinate(latitude=base_lat - 0.0010, longitude=base_lon - 0.0010),
                    Coordinate(latitude=base_lat - 0.0010, longitude=base_lon - 0.0002),
                    Coordinate(latitude=base_lat - 0.0002, longitude=base_lon - 0.0002),
                    Coordinate(latitude=base_lat - 0.0002, longitude=base_lon - 0.0010),
                ],
            ),
        ]

    async def generate_sample_points(
        self,
        polygon_geojson: Dict[str, Any],
        step_distance_meters: float = 20.0,
        max_building_distance_meters: float = 35.0,
    ) -> List[SamplePoint]:
        coords = self._extract_centroid(polygon_geojson)
        base_lat, base_lon = coords["lat"], coords["lon"]

        points: List[SamplePoint] = []
        for i in range(12):
            offset_lat = (i - 6) * 0.0003
            offset_lon = math.sin(i * 0.5) * 0.0003
            points.append(
                SamplePoint(
                    id=f"sample_{uuid.uuid4().hex[:8]}",
                    latitude=round(base_lat + offset_lat, 6),
                    longitude=round(base_lon + offset_lon, 6),
                    heading_along_road=float((i * 30) % 360),
                    road_name="Mock Blvd" if i % 2 == 0 else "Arts Alley",
                    distance_to_nearest_building_meters=float(8 + (i % 5) * 3),
                )
            )
        return points

    def _extract_centroid(self, polygon_geojson: Dict[str, Any]) -> Dict[str, float]:
        try:
            coords = polygon_geojson.get("coordinates", [])[0]
            if coords:
                lats = [c[1] for c in coords]
                lons = [c[0] for c in coords]
                return {"lat": sum(lats) / len(lats), "lon": sum(lons) / len(lons)}
        except Exception:
            pass
        return {"lat": 40.7128, "lon": -74.0060}
