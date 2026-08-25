import asyncio
import math
import uuid
from typing import Any, Dict, List, Optional, Tuple
import httpx
from shapely.geometry import LineString, Point, Polygon, shape
from shapely.strtree import STRtree

from backend.app.core.logging import logger
from backend.app.providers.base import ProviderInfo, ProviderStatus
from backend.app.providers.geodata.base import (
    BuildingFootprint,
    Coordinate,
    GeoDataProvider,
    RoadSegment,
    SamplePoint,
)
from backend.app.providers.geodata.mock import MockGeoProvider


OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]


class OSMOverpassProvider(GeoDataProvider):
    """
    Production OpenStreetMap / Overpass API Geodata Provider.
    Extracts road networks & building footprints and performs spatial candidate point sampling.
    """

    def __init__(self, timeout_seconds: float = 6.0):
        self.timeout_seconds = timeout_seconds
        self.mock_fallback = MockGeoProvider()

    def get_info(self) -> ProviderInfo:
        return ProviderInfo(
            name="osm_overpass",
            provider_type="geodata",
            description="OpenStreetMap Overpass API provider with Shapely road interpolation & STRtree building proximity",
            is_local=False,
            is_paid=False,
            status=ProviderStatus.AVAILABLE,
            status_message="Connected to OpenStreetMap Overpass infrastructure",
        )

    async def _query_overpass(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Execute an Overpass QL query with multi-endpoint failover and retry logic.
        """
        for endpoint in OVERPASS_ENDPOINTS:
            try:
                async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                    resp = await client.post(endpoint, data={"data": query})
                    if resp.status_code == 200:
                        return resp.json()
                    logger.warning(f"Overpass endpoint {endpoint} returned status {resp.status_code}")
            except Exception as e:
                logger.warning(f"Failed to query Overpass endpoint {endpoint}: {e}")
                continue

        logger.info("Overpass endpoints unavailable or timed out; utilizing fallback generation.")
        return None

    def _extract_bbox(self, polygon_geojson: Dict[str, Any]) -> Tuple[float, float, float, float]:
        """Return (min_lat, min_lon, max_lat, max_lon) from a GeoJSON polygon."""
        coords = self._get_poly_coords(polygon_geojson)
        lats = [c[1] for c in coords]
        lons = [c[0] for c in coords]
        return min(lats), min(lons), max(lats), max(lons)

    def _get_poly_coords(self, polygon_geojson: Dict[str, Any]) -> List[Tuple[float, float]]:
        try:
            if polygon_geojson.get("type") == "Polygon":
                return polygon_geojson["coordinates"][0]
            elif polygon_geojson.get("type") == "Feature":
                return polygon_geojson["geometry"]["coordinates"][0]
        except Exception:
            pass
        return [(-74.008, 40.711), (-74.004, 40.711), (-74.004, 40.715), (-74.008, 40.715), (-74.008, 40.711)]

    def _format_poly_filter(self, polygon_geojson: Dict[str, Any]) -> str:
        """Format coordinates for Overpass poly filter: 'lat1 lon1 lat2 lon2 ...'"""
        coords = self._get_poly_coords(polygon_geojson)
        poly_str = " ".join(f"{c[1]:.6f} {c[0]:.6f}" for c in coords)
        return poly_str

    async def extract_roads(self, polygon_geojson: Dict[str, Any]) -> List[RoadSegment]:
        """
        Extract road network geometries from OpenStreetMap within the polygon.
        """
        poly_str = self._format_poly_filter(polygon_geojson)
        query = f"""
        [out:json][timeout:{int(self.timeout_seconds)}];
        (
          way["highway"~"^(primary|secondary|tertiary|residential|unclassified|service|living_street|pedestrian|trunk)$"](poly:"{poly_str}");
        );
        out body;
        >;
        out skel qt;
        """
        data = await self._query_overpass(query)
        if not data or "elements" not in data:
            logger.info("Overpass query returned no results; using fallback road generator")
            return await self.mock_fallback.extract_roads(polygon_geojson)

        nodes: Dict[int, Tuple[float, float]] = {}
        for elem in data["elements"]:
            if elem["type"] == "node":
                nodes[elem["id"]] = (elem["lat"], elem["lon"])

        roads: List[RoadSegment] = []
        for elem in data["elements"]:
            if elem["type"] == "way" and "nodes" in elem:
                way_coords = []
                for nid in elem["nodes"]:
                    if nid in nodes:
                        lat, lon = nodes[nid]
                        way_coords.append(Coordinate(latitude=lat, longitude=lon))

                if len(way_coords) >= 2:
                    tags = elem.get("tags", {})
                    roads.append(
                        RoadSegment(
                            id=f"osm_way_{elem['id']}",
                            name=tags.get("name", tags.get("highway", "Unnamed Road")),
                            highway_type=tags.get("highway", "road"),
                            coordinates=way_coords,
                        )
                    )

        logger.info(f"Extracted {len(roads)} road segments from OpenStreetMap")
        return roads if roads else await self.mock_fallback.extract_roads(polygon_geojson)

    async def extract_buildings(self, polygon_geojson: Dict[str, Any]) -> List[BuildingFootprint]:
        """
        Extract building footprint polygons from OpenStreetMap within the polygon.
        """
        poly_str = self._format_poly_filter(polygon_geojson)
        query = f"""
        [out:json][timeout:{int(self.timeout_seconds)}];
        (
          way["building"](poly:"{poly_str}");
        );
        out body;
        >;
        out skel qt;
        """
        data = await self._query_overpass(query)
        if not data or "elements" not in data:
            return await self.mock_fallback.extract_buildings(polygon_geojson)

        nodes: Dict[int, Tuple[float, float]] = {}
        for elem in data["elements"]:
            if elem["type"] == "node":
                nodes[elem["id"]] = (elem["lat"], elem["lon"])

        buildings: List[BuildingFootprint] = []
        for elem in data["elements"]:
            if elem["type"] == "way" and "nodes" in elem:
                bldg_coords = []
                for nid in elem["nodes"]:
                    if nid in nodes:
                        lat, lon = nodes[nid]
                        bldg_coords.append(Coordinate(latitude=lat, longitude=lon))

                if len(bldg_coords) >= 3:
                    tags = elem.get("tags", {})
                    height = None
                    if "height" in tags:
                        try:
                            height = float(tags["height"].replace("m", "").strip())
                        except ValueError:
                            pass

                    buildings.append(
                        BuildingFootprint(
                            id=f"osm_bldg_{elem['id']}",
                            building_type=tags.get("building", "commercial"),
                            height_meters=height,
                            coordinates=bldg_coords,
                        )
                    )

        logger.info(f"Extracted {len(buildings)} building footprints from OpenStreetMap")
        return buildings if buildings else await self.mock_fallback.extract_buildings(polygon_geojson)

    async def generate_sample_points(
        self,
        polygon_geojson: Dict[str, Any],
        step_distance_meters: float = 20.0,
        max_building_distance_meters: float = 35.0,
    ) -> List[SamplePoint]:
        """
        High-performance candidate point generation:
        1. Extract roads and buildings concurrently.
        2. Project to metric Cartesian coordinate system centered on polygon.
        3. Line-interpolate sample coordinates at step_distance_meters.
        4. Calculate directional bearing (heading) along road vector.
        5. Build STRtree spatial index over building footprint polygons.
        6. Filter points within max_building_distance_meters of buildings.
        """
        # 1. Concurrently extract roads and buildings
        roads, buildings = await asyncio.gather(
            self.extract_roads(polygon_geojson),
            self.extract_buildings(polygon_geojson),
        )

        if not roads:
            return await self.mock_fallback.generate_sample_points(
                polygon_geojson, step_distance_meters, max_building_distance_meters
            )

        # 2. Compute local center latitude for projection
        min_lat, min_lon, max_lat, max_lon = self._extract_bbox(polygon_geojson)
        center_lat = (min_lat + max_lat) / 2.0
        center_lon = (min_lon + max_lon) / 2.0
        lat_rad = math.radians(center_lat)

        # Conversion factors to local meters
        m_per_deg_lat = 111132.954 - 559.822 * math.cos(2 * lat_rad) + 1.175 * math.cos(4 * lat_rad)
        m_per_deg_lon = 111412.84 * math.cos(lat_rad) - 93.5 * math.cos(3 * lat_rad)

        def to_meters(lat: float, lon: float) -> Tuple[float, float]:
            x = (lon - center_lon) * m_per_deg_lon
            y = (lat - center_lat) * m_per_deg_lat
            return x, y

        def to_lat_lon(x: float, y: float) -> Tuple[float, float]:
            lat = center_lat + (y / m_per_deg_lat)
            lon = center_lon + (x / m_per_deg_lon)
            return lat, lon

        # 3. Build metric Building Polygons and STRtree Spatial Index
        building_polys = []
        for bldg in buildings:
            if len(bldg.coordinates) >= 3:
                pts = [to_meters(c.latitude, c.longitude) for c in bldg.coordinates]
                try:
                    poly = Polygon(pts)
                    if poly.is_valid and not poly.is_empty:
                        building_polys.append(poly)
                except Exception:
                    continue

        str_tree = STRtree(building_polys) if building_polys else None

        # 4. Interpolate points along Road LineStrings
        sample_points: List[SamplePoint] = []

        for road in roads:
            if len(road.coordinates) < 2:
                continue

            meter_coords = [to_meters(c.latitude, c.longitude) for c in road.coordinates]
            try:
                line = LineString(meter_coords)
            except Exception:
                continue

            total_length = line.length
            if total_length < 5.0:
                continue

            # Step along the line
            num_steps = max(1, int(total_length / step_distance_meters))
            for i in range(num_steps + 1):
                dist = min(total_length, i * step_distance_meters)
                pt = line.interpolate(dist)
                
                # Calculate heading / orientation along line segment
                next_dist = min(total_length, dist + 2.0)
                prev_dist = max(0.0, dist - 2.0)
                if next_dist > prev_dist:
                    pt_ahead = line.interpolate(next_dist)
                    pt_behind = line.interpolate(prev_dist)
                    dx = pt_ahead.x - pt_behind.x
                    dy = pt_ahead.y - pt_behind.y
                    bearing = (math.degrees(math.atan2(dx, dy)) + 360.0) % 360.0
                else:
                    bearing = 0.0

                # 5. Measure proximity to nearest building using spatial index
                dist_to_bldg = None
                if str_tree and building_polys:
                    nearest_idx = str_tree.nearest(pt)
                    if nearest_idx is not None:
                        nearest_bldg = building_polys[nearest_idx]
                        dist_to_bldg = pt.distance(nearest_bldg)

                # 6. Apply building proximity filter
                if dist_to_bldg is not None and dist_to_bldg > max_building_distance_meters:
                    continue  # Skip point too far from any wall

                actual_lat, actual_lon = to_lat_lon(pt.x, pt.y)
                sample_points.append(
                    SamplePoint(
                        id=f"sample_{uuid.uuid4().hex[:10]}",
                        latitude=round(actual_lat, 6),
                        longitude=round(actual_lon, 6),
                        heading_along_road=round(bearing, 1),
                        road_name=road.name,
                        distance_to_nearest_building_meters=round(dist_to_bldg, 1) if dist_to_bldg is not None else None,
                    )
                )

        logger.info(f"Generated {len(sample_points)} filtered candidate coordinates along roads")
        return sample_points
