from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.database import get_db
from backend.app.models.candidate import Candidate, CandidateView
from backend.app.models.score import Score
from backend.app.schemas.common import APIResponse
from backend.app.schemas.job import JobResponse
from backend.app.schemas.scoring import (
    ScoreBreakdownDTO,
    ScoringLeaderboardItem,
    ScoringRecalculateRequest,
    ScoringStatsResponse,
    ScoringWeightsDTO,
)
from backend.app.services.job_runner import job_manager
from backend.app.services.scoring import ScoringWeights, compute_composite_score, scoring_engine_service

router = APIRouter(prefix="/scoring", tags=["Scoring Engine"])


@router.post("/calculate", response_model=APIResponse[JobResponse])
async def trigger_score_recalculation(
    req: ScoringRecalculateRequest,
):
    """
    Trigger an asynchronous job to recalculate multi-criteria composite scores
    across all mural wall candidates using active or custom weights.
    """
    weights_obj = (
        ScoringWeights(**req.weights.model_dump())
        if req.weights
        else scoring_engine_service.get_weights()
    )

    job_id = job_manager.create_job(
        job_type="scoring_recalculation",
        total_steps=3,
        params=weights_obj.model_dump(),
    )

    job_manager.start_background_task(
        job_id,
        scoring_engine_service.recalculate_all_scores,
        weights=weights_obj,
    )

    job_data = job_manager.get_job(job_id)
    return APIResponse(
        data=job_data,
        message=f"Scoring recalculation job started with ID: {job_id}",
    )


@router.get("/weights", response_model=APIResponse[ScoringWeightsDTO])
async def get_scoring_weights():
    """
    Get active normalized multi-criteria scoring weights.
    """
    w = scoring_engine_service.get_weights()
    return APIResponse(
        data=ScoringWeightsDTO(**w.model_dump()),
        message="Active scoring weights retrieved",
    )


@router.post("/weights", response_model=APIResponse[ScoringWeightsDTO])
async def update_scoring_weights(new_weights: ScoringWeightsDTO):
    """
    Update active scoring weights and return normalized values.
    """
    w_obj = ScoringWeights(**new_weights.model_dump())
    normalized = scoring_engine_service.set_weights(w_obj)
    return APIResponse(
        data=ScoringWeightsDTO(**normalized.model_dump()),
        message="Scoring weights updated and normalized to 100%",
    )


@router.get("/leaderboard", response_model=APIResponse[List[ScoringLeaderboardItem]])
async def get_scoring_leaderboard(
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """
    Get ranked candidate leaderboard ordered by overall_score descending with grade and score breakdown.
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

    active_weights = scoring_engine_service.get_weights()
    items: List[ScoringLeaderboardItem] = []

    for c in rows:
        primary_view = next((v for v in c.views if v.id == c.primary_view_id), None)
        if not primary_view and c.views:
            primary_view = c.views[0]

        attr = c.analysis_json or {}
        obstructions = float(attr.get("obstructions", 0.1))

        final_score, grade, breakdown_dict = compute_composite_score(
            wall_score=c.wall_score or 70.0,
            blankness_score=c.blankness_score or 75.0,
            visibility_score=c.visibility_score or 80.0,
            access_score=c.access_score or 85.0,
            confidence_score=c.confidence_score or 80.0,
            obstructions=obstructions,
            existing_artwork=c.existing_artwork,
            weights=active_weights,
        )

        breakdown = ScoreBreakdownDTO(**breakdown_dict)

        items.append(
            ScoringLeaderboardItem(
                id=c.id,
                search_area_id=c.search_area_id,
                latitude=c.latitude,
                longitude=c.longitude,
                address=c.address,
                best_image_id=c.best_image_id,
                primary_view_id=c.primary_view_id,
                view_count=c.view_count,
                overall_score=c.overall_score or final_score,
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
                grade=grade,
                breakdown=breakdown,
            )
        )

    return APIResponse(data=items, message=f"Retrieved {len(items)} ranked leaderboard candidates")


@router.get("/stats", response_model=APIResponse[ScoringStatsResponse])
async def get_scoring_stats(db: AsyncSession = Depends(get_db)):
    """
    Get grade distribution and overall scoring statistics.
    """
    stmt = select(Candidate)
    res = await db.execute(stmt)
    cands = res.scalars().all()

    total = len(cands)
    if total == 0:
        return APIResponse(
            data=ScoringStatsResponse(
                total_scored=0,
                grade_distribution={"A": 0, "B": 0, "C": 0, "D": 0, "F": 0},
                avg_overall_score=0.0,
                active_weights=ScoringWeightsDTO(**scoring_engine_service.get_weights().model_dump()),
                formula_description="M = 0.30W + 0.25B + 0.20V + 0.15A + 0.10C - Obstructions - Artwork",
            ),
            message="No candidates available for scoring statistics",
        )

    grade_dist = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
    total_score = 0.0

    for c in cands:
        s = c.overall_score or 75.0
        total_score += s
        if s >= 90.0:
            grade_dist["A"] += 1
        elif s >= 80.0:
            grade_dist["B"] += 1
        elif s >= 70.0:
            grade_dist["C"] += 1
        elif s >= 60.0:
            grade_dist["D"] += 1
        else:
            grade_dist["F"] += 1

    stats = ScoringStatsResponse(
        total_scored=total,
        grade_distribution=grade_dist,
        avg_overall_score=round(total_score / max(1, total), 1),
        active_weights=ScoringWeightsDTO(**scoring_engine_service.get_weights().model_dump()),
        formula_description="M = 0.30W + 0.25B + 0.20V + 0.15A + 0.10C - Obstructions - Artwork",
    )

    return APIResponse(data=stats, message="Scoring engine statistics retrieved")
