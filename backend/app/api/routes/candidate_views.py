from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db
from backend.app.models.candidate import CandidateView
from backend.app.schemas.candidate_view import (
    CandidateViewDTO,
    ViewGenerationRequest,
    ViewStatsResponse,
)
from backend.app.schemas.common import APIResponse
from backend.app.schemas.job import JobResponse
from backend.app.services.job_runner import job_manager
from backend.app.services.view_generator import view_generator_service

router = APIRouter(prefix="/views", tags=["Candidate Views"])


@router.post("/generate", response_model=APIResponse[JobResponse])
async def trigger_view_generation(
    req: ViewGenerationRequest,
):
    """
    Trigger an asynchronous background job to slice 360 panoramas and standardize
    flat street photography into perspective rectilinear views.
    """
    job_id = job_manager.create_job(
        job_type="view_generation",
        total_steps=3,
        params={
            "headings_count": req.headings_count,
            "fov_degrees": req.fov_degrees,
            "resolution": req.resolution,
        },
    )

    job_manager.start_background_task(
        job_id,
        view_generator_service.generate_views_for_imagery_batch,
        imagery_ids=req.imagery_ids,
        headings_count=req.headings_count,
        fov_degrees=req.fov_degrees,
        resolution=req.resolution,
    )

    job_data = job_manager.get_job(job_id)
    return APIResponse(
        data=job_data,
        message=f"Perspective view generation job started with ID: {job_id}",
    )


@router.get("", response_model=APIResponse[List[CandidateViewDTO]])
async def list_candidate_views(
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    is_sliced: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    List generated candidate views with heading angles, dimensions, and cache URLs.
    """
    stmt = select(CandidateView).order_by(desc(CandidateView.created_at)).offset(offset).limit(limit)
    if is_sliced is not None:
        stmt = stmt.where(CandidateView.is_sliced_from_pano == is_sliced)

    res = await db.execute(stmt)
    rows = res.scalars().all()

    dtos = [
        CandidateViewDTO(
            id=r.id,
            imagery_id=r.imagery_id,
            candidate_id=r.candidate_id,
            view_heading=r.view_heading,
            pitch=r.pitch,
            fov_degrees=r.fov_degrees,
            crop_box_json=r.crop_box_json,
            file_hash=r.file_hash,
            width=r.width,
            height=r.height,
            is_sliced_from_pano=r.is_sliced_from_pano,
            raw_clip_score=r.raw_clip_score,
            wall_detected=r.wall_detected,
            preview_url=f"/api/cache/images/{r.file_hash}",
            created_at=r.created_at,
        )
        for r in rows
    ]

    return APIResponse(data=dtos, message=f"Retrieved {len(dtos)} candidate views")


@router.get("/stats", response_model=APIResponse[ViewStatsResponse])
async def get_view_stats(db: AsyncSession = Depends(get_db)):
    """
    Get summary stats of generated views and slicing distribution.
    """
    total_views = (await db.execute(select(func.count(CandidateView.id)))).scalar_one() or 0
    pano_slices = (
        await db.execute(select(func.count(CandidateView.id)).where(CandidateView.is_sliced_from_pano == True))
    ).scalar_one() or 0
    flat_views = total_views - pano_slices
    unique_src = (
        await db.execute(select(func.count(func.distinct(CandidateView.imagery_id))))
    ).scalar_one() or 0

    stats = ViewStatsResponse(
        total_views=total_views,
        panoramic_slices=pano_slices,
        flat_perspective_views=flat_views,
        unique_source_images=unique_src,
    )

    return APIResponse(data=stats, message="Candidate view statistics retrieved")


@router.get("/{view_id}", response_model=APIResponse[CandidateViewDTO])
async def get_candidate_view_detail(view_id: int, db: AsyncSession = Depends(get_db)):
    """
    Get metadata for a single candidate view.
    """
    stmt = select(CandidateView).where(CandidateView.id == view_id)
    r = (await db.execute(stmt)).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail=f"Candidate view {view_id} not found")

    dto = CandidateViewDTO(
        id=r.id,
        imagery_id=r.imagery_id,
        candidate_id=r.candidate_id,
        view_heading=r.view_heading,
        pitch=r.pitch,
        fov_degrees=r.fov_degrees,
        crop_box_json=r.crop_box_json,
        file_hash=r.file_hash,
        width=r.width,
        height=r.height,
        is_sliced_from_pano=r.is_sliced_from_pano,
        preview_url=f"/api/cache/images/{r.file_hash}",
        created_at=r.created_at,
    )

    return APIResponse(data=dto, message="Candidate view found")
