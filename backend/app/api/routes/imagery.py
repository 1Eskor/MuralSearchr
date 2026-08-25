from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db
from backend.app.models.imagery import Imagery
from backend.app.models.search_area import SearchArea
from backend.app.providers.geodata.base import SamplePoint
from backend.app.providers.registry import registry
from backend.app.schemas.common import APIResponse
from backend.app.schemas.imagery import (
    ImageryDTO,
    ImageryIngestRequest,
    ImageryStats,
)
from backend.app.schemas.job import JobResponse
from backend.app.services.cache import cache_manager
from backend.app.services.ingestion import ingestion_service
from backend.app.services.job_runner import job_manager

router = APIRouter(prefix="/imagery", tags=["Imagery"])


@router.post("/ingest", response_model=APIResponse[JobResponse])
async def trigger_imagery_ingestion(
    req: ImageryIngestRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger an asynchronous background job to query, download, and cache
    street-level photography for candidate coordinates or a search area.
    """
    sample_points: List[SamplePoint] = []

    # 1. If explicit points provided
    if req.sample_points:
        sample_points = [
            SamplePoint(
                id=p.id,
                latitude=p.latitude,
                longitude=p.longitude,
                heading_along_road=p.heading_along_road,
                road_name=p.road_name,
                distance_to_nearest_building_meters=p.distance_to_nearest_building_meters,
            )
            for p in req.sample_points
        ]
    # 2. Or if search_area_id provided
    elif req.search_area_id:
        stmt = select(SearchArea).where(SearchArea.id == req.search_area_id)
        area = (await db.execute(stmt)).scalar_one_or_none()
        if not area:
            raise HTTPException(status_code=404, detail=f"Search area {req.search_area_id} not found")
        geo_provider = registry.get_geodata_provider()
        sample_points = await geo_provider.generate_sample_points(area.polygon_geojson)
    # 3. Or if polygon_geojson provided
    elif req.polygon_geojson:
        geo_provider = registry.get_geodata_provider()
        sample_points = await geo_provider.generate_sample_points(req.polygon_geojson)
    else:
        # Fallback default test polygon
        geo_provider = registry.get_geodata_provider()
        sample_points = await geo_provider.generate_sample_points(
            {"type": "Polygon", "coordinates": [[[-80.202, 25.798], [-80.196, 25.798], [-80.196, 25.804], [-80.202, 25.804], [-80.202, 25.798]]]}
        )

    # Create background job
    job_id = job_manager.create_job(
        job_type="imagery_ingestion",
        total_steps=3,
        params={"total_sample_points": len(sample_points), "provider": req.provider},
    )

    # Launch worker
    job_manager.start_background_task(
        job_id,
        ingestion_service.ingest_for_points,
        sample_points=sample_points,
        max_images_per_point=req.max_images_per_point,
        radius_meters=req.radius_meters,
        provider_name=req.provider,
    )

    job_data = job_manager.get_job(job_id)
    return APIResponse(
        data=job_data,
        message=f"Imagery ingestion job started for {len(sample_points)} sample points with ID: {job_id}",
    )


@router.get("", response_model=APIResponse[List[ImageryDTO]])
async def list_imagery(
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """
    List stored street view photos with metadata and cache URLs.
    """
    stmt = select(Imagery).order_by(desc(Imagery.created_at)).offset(offset).limit(limit)
    res = await db.execute(stmt)
    rows = res.scalars().all()

    dtos = [
        ImageryDTO(
            id=r.id,
            provider=r.provider,
            external_id=r.external_id,
            latitude=r.latitude,
            longitude=r.longitude,
            heading=r.heading,
            pitch=r.pitch,
            capture_date=r.capture_date,
            source_url=r.source_url,
            local_path=r.local_path,
            file_hash=r.file_hash,
            width=r.width,
            height=r.height,
            is_cached=r.is_cached,
            preview_url=f"/api/cache/images/{r.file_hash}",
            metadata_json=r.metadata_json,
            created_at=r.created_at,
        )
        for r in rows
    ]

    return APIResponse(data=dtos, message=f"Retrieved {len(dtos)} imagery records")


@router.get("/stats", response_model=APIResponse[ImageryStats])
async def get_imagery_stats(db: AsyncSession = Depends(get_db)):
    """
    Get summary statistics and provider token status.
    """
    total_count = (await db.execute(select(func.count(Imagery.id)))).scalar_one() or 0
    cached_count = (await db.execute(select(func.count(Imagery.id)).where(Imagery.is_cached == True))).scalar_one() or 0
    cache_data = cache_manager.get_stats()
    provider_info = registry.get_imagery_provider().get_info()

    stats = ImageryStats(
        total_images=total_count,
        cached_images=cached_count,
        total_storage_mb=cache_data["total_mb"],
        active_provider=provider_info.name,
        is_live_api_active=provider_info.status.value == "configured",
        status_message=provider_info.status_message or "Operational",
    )

    return APIResponse(data=stats, message="Imagery statistics retrieved")


@router.get("/{image_id}", response_model=APIResponse[ImageryDTO])
async def get_imagery_detail(image_id: int, db: AsyncSession = Depends(get_db)):
    """
    Get detailed metadata for a single street photography record.
    """
    stmt = select(Imagery).where(Imagery.id == image_id)
    r = (await db.execute(stmt)).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")

    dto = ImageryDTO(
        id=r.id,
        provider=r.provider,
        external_id=r.external_id,
        latitude=r.latitude,
        longitude=r.longitude,
        heading=r.heading,
        pitch=r.pitch,
        capture_date=r.capture_date,
        source_url=r.source_url,
        local_path=r.local_path,
        file_hash=r.file_hash,
        width=r.width,
        height=r.height,
        is_cached=r.is_cached,
        preview_url=f"/api/cache/images/{r.file_hash}",
        metadata_json=r.metadata_json,
        created_at=r.created_at,
    )

    return APIResponse(data=dto, message="Image found")
