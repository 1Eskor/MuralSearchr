from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.database import get_db
from backend.app.models.candidate import Candidate, CandidateView
from backend.app.providers.registry import registry
from backend.app.schemas.analysis import AnalysisRequest, AnalysisStatsResponse
from backend.app.schemas.candidate import CandidateDTO, CandidateDetailDTO
from backend.app.schemas.candidate_view import CandidateViewDTO
from backend.app.schemas.common import APIResponse
from backend.app.schemas.job import JobResponse
from backend.app.services.analyzer import vision_analysis_service
from backend.app.services.job_runner import job_manager

router = APIRouter(prefix="/analysis", tags=["Vision Analysis"])


@router.post("/analyze", response_model=APIResponse[JobResponse])
async def trigger_vision_analysis(
    req: AnalysisRequest,
):
    """
    Trigger an asynchronous job to extract structured wall paintability attributes
    (surface quality, blankness, obstructions, size class, material, artwork presence)
    for promoted candidates using the Local VLM.
    """
    job_id = job_manager.create_job(
        job_type="vision_analysis",
        total_steps=3,
        params={
            "provider": req.provider,
            "candidate_ids_count": len(req.candidate_ids) if req.candidate_ids else "all_promoted",
        },
    )

    job_manager.start_background_task(
        job_id,
        vision_analysis_service.analyze_candidates_batch,
        candidate_ids=req.candidate_ids,
        provider_name=req.provider,
    )

    job_data = job_manager.get_job(job_id)
    return APIResponse(
        data=job_data,
        message=f"Local VLM Vision Analysis job started with ID: {job_id}",
    )


@router.get("/candidates", response_model=APIResponse[List[CandidateDetailDTO]])
async def list_analyzed_candidates(
    limit: int = Query(default=30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """
    List wall candidates that have completed detailed VLM analysis.
    """
    stmt = (
        select(Candidate)
        .options(selectinload(Candidate.views))
        .where(Candidate.analysis_json.isnot(None))
        .order_by(desc(Candidate.wall_score))
        .limit(limit)
    )
    res = await db.execute(stmt)
    rows = res.scalars().all()

    dtos: List[CandidateDetailDTO] = []
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

        dtos.append(
            CandidateDetailDTO(
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
        )

    return APIResponse(data=dtos, message=f"Retrieved {len(dtos)} analyzed candidates")


@router.get("/stats", response_model=APIResponse[AnalysisStatsResponse])
async def get_analysis_stats(db: AsyncSession = Depends(get_db)):
    """
    Get detailed vision analysis breakdown across wall materials, sizes, and paintability.
    """
    stmt = select(Candidate).where(Candidate.analysis_json.isnot(None))
    res = await db.execute(stmt)
    cands = res.scalars().all()

    total = len(cands)
    if total == 0:
        return APIResponse(
            data=AnalysisStatsResponse(
                total_analyzed=0,
                materials_breakdown={"brick": 0, "concrete": 0, "stucco": 0, "masonry": 0},
                size_classes_breakdown={"small": 0, "medium": 0, "large": 0, "very_large": 0},
                artwork_detected_count=0,
                avg_blankness_pct=0.0,
                avg_quality_pct=0.0,
                model_name="Local VLM (llava/moondream)",
            ),
            message="No candidates analyzed yet",
        )

    materials: dict = {}
    sizes: dict = {}
    artwork_count = 0
    total_blankness = 0.0
    total_quality = 0.0

    for c in cands:
        m = c.wall_material or "brick"
        materials[m] = materials.get(m, 0) + 1
        s = c.estimated_size or "medium"
        sizes[s] = sizes.get(s, 0) + 1
        if c.existing_artwork:
            artwork_count += 1
        total_blankness += c.blankness_score or 0.0
        total_quality += c.wall_score or 0.0

    stats = AnalysisStatsResponse(
        total_analyzed=total,
        materials_breakdown=materials,
        size_classes_breakdown=sizes,
        artwork_detected_count=artwork_count,
        avg_blankness_pct=round(total_blankness / max(1, total), 1),
        avg_quality_pct=round(total_quality / max(1, total), 1),
        model_name="Local VLM (llava/moondream)",
    )

    return APIResponse(data=stats, message="Analysis statistics retrieved")
