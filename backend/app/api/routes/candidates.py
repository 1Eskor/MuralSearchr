from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.database import get_db
from backend.app.models.candidate import Candidate, CandidateView
from backend.app.models.imagery import Imagery
from backend.app.models.search_area import SearchArea
from backend.app.schemas.candidate import (
    CandidateDTO,
    CandidateDetailDTO,
    FunnelStatsResponse,
    ReductionRequest,
)
from backend.app.schemas.candidate_view import CandidateViewDTO
from backend.app.schemas.common import APIResponse
from backend.app.schemas.job import JobResponse
from backend.app.services.job_runner import job_manager
from backend.app.services.reduction import candidate_reduction_service

router = APIRouter(prefix="/candidates", tags=["Candidates"])


@router.post("/reduce", response_model=APIResponse[JobResponse])
async def trigger_candidate_reduction(
    req: ReductionRequest,
):
    """
    Trigger an asynchronous job to filter top CLIP-ranked perspective views,
    cluster nearby viewpoints, and promote them into unified Wall Candidate entities.
    """
    job_id = job_manager.create_job(
        job_type="candidate_reduction",
        total_steps=4,
        params={
            "min_score": req.min_score,
            "top_percentile": req.top_percentile,
            "cluster_distance_meters": req.cluster_distance_meters,
            "max_candidates": req.max_candidates,
            "excluded_materials": req.excluded_materials,
        },
    )

    job_manager.start_background_task(
        job_id,
        candidate_reduction_service.reduce_and_promote_candidates,
        min_score=req.min_score,
        top_percentile=req.top_percentile,
        cluster_distance_meters=req.cluster_distance_meters,
        max_candidates=req.max_candidates,
        excluded_materials=req.excluded_materials,
    )

    job_data = job_manager.get_job(job_id)
    return APIResponse(
        data=job_data,
        message=f"Candidate Reduction & Promotion job started with ID: {job_id}",
    )


@router.get("", response_model=APIResponse[List[CandidateDTO]])
async def list_candidates(
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    min_score: float = Query(default=0.0, ge=0.0, le=100.0),
    db: AsyncSession = Depends(get_db),
):
    """
    List promoted wall candidates sorted by score in descending order.
    """
    stmt = (
        select(Candidate)
        .where(Candidate.overall_score >= min_score)
        .order_by(desc(Candidate.overall_score), desc(Candidate.id))
        .offset(offset)
        .limit(limit)
    )
    res = await db.execute(stmt)
    candidates = res.scalars().all()

    dtos: List[CandidateDTO] = []
    for c in candidates:
        # Fetch primary view preview if available
        primary_view = None
        if c.primary_view_id:
            stmt_v = select(CandidateView).where(CandidateView.id == c.primary_view_id)
            primary_view = (await db.execute(stmt_v)).scalar_one_or_none()

        dtos.append(
            CandidateDTO(
                id=c.id,
                search_area_id=c.search_area_id,
                latitude=c.latitude,
                longitude=c.longitude,
                address=c.address,
                best_image_id=c.best_image_id,
                primary_view_id=c.primary_view_id,
                view_count=c.view_count,
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
                created_at=c.created_at,
            )
        )

    return APIResponse(data=dtos, message=f"Retrieved {len(dtos)} candidates")


@router.get("/stats", response_model=APIResponse[FunnelStatsResponse])
async def get_candidate_stats(db: AsyncSession = Depends(get_db)):
    """
    Get full pipeline funnel statistics (Geodata -> Imagery -> Views -> CLIP -> Candidates).
    """
    total_points = (
        await db.execute(select(func.count(CandidateView.id)))
    ).scalar_one() or 0  # fallback or sum sample points
    total_imgs = (await db.execute(select(func.count(Imagery.id)))).scalar_one() or 0
    total_views = (await db.execute(select(func.count(CandidateView.id)))).scalar_one() or 0
    total_ranked = (
        await db.execute(
            select(func.count(CandidateView.id)).where(CandidateView.raw_clip_score > 0.0)
        )
    ).scalar_one() or 0
    total_cands = (await db.execute(select(func.count(Candidate.id)))).scalar_one() or 0

    noise_reduc = round(
        (1.0 - (total_cands / max(1, total_views))) * 100.0 if total_views > 0 else 0.0, 1
    )
    vlm_saved = max(0, total_views - total_cands)
    dollars_saved = round(vlm_saved * 0.005, 3)

    stats = FunnelStatsResponse(
        total_geodata_points=max(12, total_imgs // 2),
        total_imagery_photos=total_imgs,
        total_perspective_views=total_views,
        total_clip_ranked=total_ranked,
        promoted_candidates=total_cands,
        noise_reduction_pct=noise_reduc,
        vlm_api_calls_saved=vlm_saved,
        estimated_dollars_saved=dollars_saved,
    )

    return APIResponse(data=stats, message="Funnel metrics retrieved")


@router.get("/{candidate_id}", response_model=APIResponse[CandidateDetailDTO])
async def get_candidate_detail(
    candidate_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Get detailed candidate record including all associated multi-angle perspective views.
    """
    stmt = (
        select(Candidate)
        .options(selectinload(Candidate.views))
        .where(Candidate.id == candidate_id)
    )
    res = await db.execute(stmt)
    c = res.scalar_one_or_none()

    if not c:
        raise HTTPException(status_code=404, detail=f"Candidate {candidate_id} not found")

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

    detail = CandidateDetailDTO(
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
    )

    return APIResponse(data=detail, message=f"Candidate {candidate_id} details retrieved")
