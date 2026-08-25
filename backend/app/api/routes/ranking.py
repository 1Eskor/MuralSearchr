from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.models.candidate import CandidateView
from backend.app.providers.registry import registry
from backend.app.providers.vision.openclip import DEFAULT_NEGATIVE_PROMPTS, DEFAULT_POSITIVE_PROMPTS
from backend.app.schemas.candidate_view import CandidateViewDTO
from backend.app.schemas.common import APIResponse
from backend.app.schemas.job import JobResponse
from backend.app.schemas.ranking import (
    PromptConfigDTO,
    RankingRequest,
    RankingStatsResponse,
)
from backend.app.services.job_runner import job_manager
from backend.app.services.ranker import vision_ranking_service

router = APIRouter(prefix="/ranking", tags=["Vision Ranking"])


@router.post("/rank", response_model=APIResponse[JobResponse])
async def trigger_vision_ranking(
    req: RankingRequest,
):
    """
    Trigger an asynchronous background job to score perspective candidate views
    against positive and negative prompt ensembles using local OpenCLIP/SigLIP.
    """
    job_id = job_manager.create_job(
        job_type="vision_ranking",
        total_steps=3,
        params={
            "provider": req.provider,
            "positive_prompts_count": len(req.positive_prompts or DEFAULT_POSITIVE_PROMPTS),
            "negative_prompts_count": len(req.negative_prompts or DEFAULT_NEGATIVE_PROMPTS),
        },
    )

    job_manager.start_background_task(
        job_id,
        vision_ranking_service.rank_candidate_views,
        view_ids=req.view_ids,
        provider_name=req.provider,
        positive_prompts=req.positive_prompts,
        negative_prompts=req.negative_prompts,
        batch_size=req.batch_size,
    )

    job_data = job_manager.get_job(job_id)
    return APIResponse(
        data=job_data,
        message=f"Local CLIP Vision Ranking job started with ID: {job_id}",
    )


@router.get("/prompts", response_model=APIResponse[PromptConfigDTO])
async def get_ranking_prompts():
    """
    Get active positive and negative prompt ensembles.
    """
    dto = PromptConfigDTO(
        positive_prompts=DEFAULT_POSITIVE_PROMPTS,
        negative_prompts=DEFAULT_NEGATIVE_PROMPTS,
    )
    return APIResponse(data=dto, message="Prompt ensembles retrieved")


@router.get("/top", response_model=APIResponse[List[CandidateViewDTO]])
async def get_top_ranked_views(
    limit: int = Query(default=20, ge=1, le=100),
    min_score: float = Query(default=0.0, ge=0.0, le=1.0),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve candidate perspective views sorted by CLIP score in descending order.
    """
    stmt = (
        select(CandidateView)
        .where(CandidateView.raw_clip_score >= min_score)
        .order_by(desc(CandidateView.raw_clip_score))
        .limit(limit)
    )
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

    return APIResponse(data=dtos, message=f"Retrieved top {len(dtos)} ranked candidate views")


@router.get("/stats", response_model=APIResponse[RankingStatsResponse])
async def get_ranking_stats(db: AsyncSession = Depends(get_db)):
    """
    Get score distribution histogram, pass/reject counts, and active ranker device.
    """
    settings = get_settings()
    total_views = (await db.execute(select(func.count(CandidateView.id)))).scalar_one() or 0
    passed = (
        await db.execute(select(func.count(CandidateView.id)).where(CandidateView.wall_detected == True))
    ).scalar_one() or 0
    rejected = total_views - passed

    # Compute histogram across 5 score brackets
    h_0_2 = (
        await db.execute(
            select(func.count(CandidateView.id)).where(CandidateView.raw_clip_score < 0.2)
        )
    ).scalar_one() or 0

    h_2_4 = (
        await db.execute(
            select(func.count(CandidateView.id)).where(
                (CandidateView.raw_clip_score >= 0.2) & (CandidateView.raw_clip_score < 0.4)
            )
        )
    ).scalar_one() or 0

    h_4_6 = (
        await db.execute(
            select(func.count(CandidateView.id)).where(
                (CandidateView.raw_clip_score >= 0.4) & (CandidateView.raw_clip_score < 0.6)
            )
        )
    ).scalar_one() or 0

    h_6_8 = (
        await db.execute(
            select(func.count(CandidateView.id)).where(
                (CandidateView.raw_clip_score >= 0.6) & (CandidateView.raw_clip_score < 0.8)
            )
        )
    ).scalar_one() or 0

    h_8_10 = (
        await db.execute(
            select(func.count(CandidateView.id)).where(CandidateView.raw_clip_score >= 0.8)
        )
    ).scalar_one() or 0

    histogram = {
        "0.0-0.2": h_0_2,
        "0.2-0.4": h_2_4,
        "0.4-0.6": h_4_6,
        "0.6-0.8": h_6_8,
        "0.8-1.0": h_8_10,
    }

    ranker_info = registry.get_vision_ranker().get_info()
    stats = RankingStatsResponse(
        total_ranked_views=total_views,
        passed_count=passed,
        rejected_count=rejected,
        pass_rate_pct=round((passed / max(1, total_views)) * 100.0, 1),
        histogram=histogram,
        model_name="OpenCLIP ViT-B/32",
        device=settings.detected_device.upper(),
    )

    return APIResponse(data=stats, message="Ranking statistics retrieved")
