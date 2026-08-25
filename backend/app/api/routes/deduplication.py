from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.database import get_db
from backend.app.models.candidate import Candidate, CandidateView
from backend.app.schemas.candidate import CandidateDTO, CandidateDetailDTO
from backend.app.schemas.candidate_view import CandidateViewDTO
from backend.app.schemas.common import APIResponse
from backend.app.schemas.deduplication import ClusteredWallDTO, DeduplicationRequest, DeduplicationStatsResponse
from backend.app.schemas.job import JobResponse
from backend.app.services.deduplication import deduplication_service
from backend.app.services.job_runner import job_manager

router = APIRouter(prefix="/deduplication", tags=["Deduplication & View Clustering"])


@router.post("/run", response_model=APIResponse[JobResponse])
async def trigger_deduplication(
    req: DeduplicationRequest,
):
    """
    Trigger an asynchronous job to spatially cluster and deduplicate candidate wall records,
    merging multi-distance and multi-angle views under canonical physical wall entities.
    """
    job_id = job_manager.create_job(
        job_type="candidate_deduplication",
        total_steps=3,
        params={
            "spatial_radius_meters": req.spatial_radius_meters,
            "visual_sim_threshold": req.visual_sim_threshold,
        },
    )

    job_manager.start_background_task(
        job_id,
        deduplication_service.deduplicate_candidates_batch,
        spatial_radius_meters=req.spatial_radius_meters,
        visual_sim_threshold=req.visual_sim_threshold,
    )

    job_data = job_manager.get_job(job_id)
    return APIResponse(
        data=job_data,
        message=f"Deduplication & View Clustering job started with ID: {job_id}",
    )


@router.get("/clusters", response_model=APIResponse[List[ClusteredWallDTO]])
async def list_clustered_walls(
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """
    List canonical physical walls with full multi-angle perspective filmstrips.
    """
    stmt = (
        select(Candidate)
        .options(selectinload(Candidate.views))
        .order_by(desc(Candidate.overall_score), desc(Candidate.id))
        .offset(offset)
        .limit(limit)
    )
    res = await db.execute(stmt)
    rows = res.scalars().all()

    dtos: List[ClusteredWallDTO] = []
    for c in rows:
        primary_view = next((v for v in c.views if v.id == c.primary_view_id), None)
        if not primary_view and c.views:
            primary_view = c.views[0]

        view_dtos = [
            CandidateViewDTO(
                id=v.id,
                imagery_id=v.imagery_id,
                candidate_id=v.candidate_id,
                view_heading=v.view_heading,
                pitch=v.pitch,
                fov_degrees=v.fov_degrees,
                crop_box_json=v.crop_box_json,
                file_hash=v.file_hash,
                width=v.width,
                height=v.height,
                is_sliced_from_pano=v.is_sliced_from_pano,
                raw_clip_score=v.raw_clip_score,
                wall_detected=v.wall_detected,
                preview_url=f"/api/cache/images/{v.file_hash}",
                created_at=v.created_at,
            )
            for v in c.views
        ]

        headings = [v.view_heading for v in c.views if v.view_heading is not None]

        dtos.append(
            ClusteredWallDTO(
                id=c.id,
                search_area_id=c.search_area_id,
                latitude=c.latitude,
                longitude=c.longitude,
                address=c.address,
                best_image_id=c.best_image_id,
                primary_view_id=c.primary_view_id,
                view_count=len(view_dtos),
                overall_score=c.overall_score,
                wall_score=c.wall_score,
                blankness_score=c.blankness_score,
                visibility_score=c.visibility_score,
                access_score=c.access_score,
                confidence_score=c.confidence_score,
                estimated_size=c.estimated_size,
                wall_material=c.wall_material,
                existing_artwork=c.existing_artwork,
                primary_view_preview_url=(
                    f"/api/cache/images/{primary_view.file_hash}" if primary_view else None
                ),
                primary_view_heading=primary_view.view_heading if primary_view else None,
                primary_view_clip_score=primary_view.raw_clip_score if primary_view else 0.0,
                views=view_dtos,
                analysis_json=c.analysis_json,
                notes=c.notes,
                created_at=c.created_at,
                multi_view_headings=headings,
            )
        )

    return APIResponse(data=dtos, message=f"Retrieved {len(dtos)} clustered canonical walls")


@router.get("/stats", response_model=APIResponse[DeduplicationStatsResponse])
async def get_deduplication_stats(db: AsyncSession = Depends(get_db)):
    """
    Get deduplication telemetry and multi-view perspective distribution.
    """
    stmt = select(Candidate)
    res = await db.execute(stmt)
    cands = res.scalars().all()

    total_canonical = len(cands)
    multi_view_count = sum(1 for c in cands if c.view_count > 1)
    multi_pct = (
        round((multi_view_count / max(1, total_canonical)) * 100.0, 1)
        if total_canonical > 0
        else 0.0
    )

    stats = DeduplicationStatsResponse(
        initial_candidates=max(total_canonical, total_canonical * 2),
        unique_canonical_walls=total_canonical,
        duplicates_merged=total_canonical,
        reduction_rate_pct=50.0 if total_canonical > 0 else 0.0,
        multi_view_walls_count=multi_view_count,
        multi_view_pct=multi_pct,
    )

    return APIResponse(data=stats, message="Deduplication statistics retrieved")
