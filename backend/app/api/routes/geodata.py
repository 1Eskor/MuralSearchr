import asyncio
import time
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException
from backend.app.core.logging import logger
from backend.app.providers.registry import registry
from backend.app.schemas.common import APIResponse
from backend.app.schemas.search_area import (
    ExtractionRequest,
    ExtractionResult,
    SamplePointDTO,
)

router = APIRouter(prefix="/geodata", tags=["Geodata"])


@router.post("/extract", response_model=APIResponse[ExtractionResult])
async def extract_geographic_data(req: ExtractionRequest):
    """
    Extract OpenStreetMap roads and building footprints within a polygon,
    and generate building-proximity filtered candidate sample coordinates.
    """
    start_time = time.time()
    provider = registry.get_geodata_provider(req.provider)

    try:
        # 1. Concurrently fetch roads, buildings, and sample points
        roads_task = provider.extract_roads(req.polygon_geojson)
        bldgs_task = provider.extract_buildings(req.polygon_geojson)
        points_task = provider.generate_sample_points(
            req.polygon_geojson,
            step_distance_meters=req.step_distance_meters,
            max_building_distance_meters=req.max_building_distance_meters,
        )

        roads, buildings, sample_points = await asyncio.gather(roads_task, bldgs_task, points_task)

        # 2. Build GeoJSON feature representations for frontend rendering
        roads_features = []
        for r in roads:
            coords = [[c.longitude, c.latitude] for c in r.coordinates]
            roads_features.append(
                {
                    "type": "Feature",
                    "properties": {"id": r.id, "name": r.name, "highway": r.highway_type},
                    "geometry": {"type": "LineString", "coordinates": coords},
                }
            )

        bldg_features = []
        for b in buildings:
            if len(b.coordinates) >= 3:
                coords = [[c.longitude, c.latitude] for c in b.coordinates]
                # Ensure closed ring
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                bldg_features.append(
                    {
                        "type": "Feature",
                        "properties": {"id": b.id, "building_type": b.building_type, "height": b.height_meters},
                        "geometry": {"type": "Polygon", "coordinates": [coords]},
                    }
                )

        points_dto = [
            SamplePointDTO(
                id=pt.id,
                latitude=pt.latitude,
                longitude=pt.longitude,
                heading_along_road=pt.heading_along_road,
                road_name=pt.road_name,
                distance_to_nearest_building_meters=pt.distance_to_nearest_building_meters,
            )
            for pt in sample_points
        ]

        duration = round(time.time() - start_time, 2)
        result = ExtractionResult(
            total_roads=len(roads),
            total_buildings=len(buildings),
            total_sample_points=len(points_dto),
            duration_seconds=duration,
            sample_points=points_dto,
            roads_geojson={"type": "FeatureCollection", "features": roads_features},
            buildings_geojson={"type": "FeatureCollection", "features": bldg_features},
        )

        return APIResponse(
            data=result,
            message=f"Extracted {len(roads)} roads, {len(buildings)} buildings, generated {len(points_dto)} candidate points in {duration}s",
        )

    except Exception as e:
        logger.exception(f"Geodata extraction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Geodata extraction error: {str(e)}")
