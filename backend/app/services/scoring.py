import asyncio
import time
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.config import Settings, get_settings
from backend.app.core.database import async_session_factory
from backend.app.core.logging import logger
from backend.app.models.candidate import Candidate, CandidateView
from backend.app.models.score import Score
from backend.app.services.job_runner import JobManager, job_manager


class ScoringWeights(BaseModel):
    wall_quality_weight: float = Field(default=0.30, ge=0.0, le=1.0)
    blankness_weight: float = Field(default=0.25, ge=0.0, le=1.0)
    visibility_weight: float = Field(default=0.20, ge=0.0, le=1.0)
    accessibility_weight: float = Field(default=0.15, ge=0.0, le=1.0)
    confidence_weight: float = Field(default=0.10, ge=0.0, le=1.0)
    obstruction_penalty_factor: float = Field(default=25.0, ge=0.0, le=100.0)
    existing_artwork_penalty: float = Field(default=40.0, ge=0.0, le=100.0)

    def get_normalized(self) -> "ScoringWeights":
        total = (
            self.wall_quality_weight
            + self.blankness_weight
            + self.visibility_weight
            + self.accessibility_weight
            + self.confidence_weight
        )
        if total <= 0:
            return ScoringWeights()
        return ScoringWeights(
            wall_quality_weight=round(self.wall_quality_weight / total, 4),
            blankness_weight=round(self.blankness_weight / total, 4),
            visibility_weight=round(self.visibility_weight / total, 4),
            accessibility_weight=round(self.accessibility_weight / total, 4),
            confidence_weight=round(self.confidence_weight / total, 4),
            obstruction_penalty_factor=self.obstruction_penalty_factor,
            existing_artwork_penalty=self.existing_artwork_penalty,
        )


def compute_composite_score(
    wall_score: float,
    blankness_score: float,
    visibility_score: float,
    access_score: float,
    confidence_score: float,
    obstructions: float = 0.0,
    existing_artwork: bool = False,
    weights: Optional[ScoringWeights] = None,
) -> Tuple[float, str, Dict[str, Any]]:
    """
    Computes weighted composite score (0-100) and letter grade tier.
    Formula: M = 0.30W + 0.25B + 0.20V + 0.15A + 0.10C - Penalties
    """
    w = (weights or ScoringWeights()).get_normalized()

    w_part = wall_score * w.wall_quality_weight
    b_part = blankness_score * w.blankness_weight
    v_part = visibility_score * w.visibility_weight
    a_part = access_score * w.accessibility_weight
    c_part = confidence_score * w.confidence_weight

    base_sum = w_part + b_part + v_part + a_part + c_part

    # Penalty deductions
    obs_penalty = round(obstructions * w.obstruction_penalty_factor, 1)
    art_penalty = w.existing_artwork_penalty if existing_artwork else 0.0
    total_penalties = obs_penalty + art_penalty

    final_score = round(max(0.0, min(100.0, base_sum - total_penalties)), 1)

    if final_score >= 90.0:
        grade = "A+" if final_score >= 95.0 else "A"
    elif final_score >= 80.0:
        grade = "B"
    elif final_score >= 70.0:
        grade = "C"
    elif final_score >= 60.0:
        grade = "D"
    else:
        grade = "F"

    breakdown = {
        "wall_quality_component": round(w_part, 2),
        "blankness_component": round(b_part, 2),
        "visibility_component": round(v_part, 2),
        "accessibility_component": round(a_part, 2),
        "confidence_component": round(c_part, 2),
        "base_sum": round(base_sum, 2),
        "obstruction_penalty": obs_penalty,
        "artwork_penalty": art_penalty,
        "final_score": final_score,
        "grade": grade,
    }

    return final_score, grade, breakdown


class ScoringEngineService:
    """
    Multi-Criteria Scoring Engine Service managing composite formula execution,
    weight updates, and ranking snapshots.
    """

    def __init__(
        self,
        job_mgr: Optional[JobManager] = None,
        settings: Optional[Settings] = None,
    ):
        self.jobs = job_mgr or job_manager
        self.settings = settings or get_settings()
        self.current_weights = ScoringWeights()

    def get_weights(self) -> ScoringWeights:
        return self.current_weights.get_normalized()

    def set_weights(self, weights: ScoringWeights) -> ScoringWeights:
        self.current_weights = weights.get_normalized()
        return self.current_weights

    async def recalculate_all_scores(
        self,
        job_id: str,
        weights: Optional[ScoringWeights] = None,
    ) -> Dict[str, Any]:
        """
        Recalculates composite scores for all candidate entities using active weights.
        """
        start_time = time.time()
        active_weights = (weights or self.current_weights).get_normalized()
        self.current_weights = active_weights

        await self.jobs.update_job(
            job_id,
            status="running",
            step_index=1,
            step_name="Loading Wall Candidates from Database",
            message="Querying candidate entities and visual telemetry...",
            progress=15.0,
        )

        async with async_session_factory() as session:
            stmt = select(Candidate).options(selectinload(Candidate.views))
            res = await session.execute(stmt)
            candidates = list(res.scalars().all())

        total = len(candidates)
        if total == 0:
            return {
                "status": "completed",
                "total_candidates_scored": 0,
                "duration_seconds": 0.0,
                "grade_distribution": {},
            }

        await self.jobs.update_job(
            job_id,
            step_index=2,
            step_name="Executing Multi-Criteria Scoring Formula",
            message=f"Computing M = 0.30W + 0.25B + 0.20V + 0.15A + 0.10C for {total} walls...",
            progress=40.0,
        )

        score_records: List[Dict[str, Any]] = []
        grade_dist: Dict[str, int] = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0}

        async with async_session_factory() as session:
            for idx, cand in enumerate(candidates):
                # Extract visual attributes
                attr = cand.analysis_json or {}
                obstructions = float(attr.get("obstructions", 0.1))

                final_score, grade, breakdown = compute_composite_score(
                    wall_score=cand.wall_score or 70.0,
                    blankness_score=cand.blankness_score or 75.0,
                    visibility_score=cand.visibility_score or 80.0,
                    access_score=cand.access_score or 85.0,
                    confidence_score=cand.confidence_score or 80.0,
                    obstructions=obstructions,
                    existing_artwork=cand.existing_artwork,
                    weights=active_weights,
                )

                # Track grade
                base_grade = grade.replace("+", "")
                grade_dist[base_grade] = grade_dist.get(base_grade, 0) + 1

                # Update Candidate overall_score
                stmt_c = select(Candidate).where(Candidate.id == cand.id)
                cand_db = (await session.execute(stmt_c)).scalar_one_or_none()
                if cand_db:
                    cand_db.overall_score = final_score

                # Add Score history entry
                score_entry = Score(
                    candidate_id=cand.id,
                    scoring_version=1,
                    wall_score=cand.wall_score or 70.0,
                    blankness_score=cand.blankness_score or 75.0,
                    visibility_score=cand.visibility_score or 80.0,
                    access_score=cand.access_score or 85.0,
                    confidence_score=cand.confidence_score or 80.0,
                    composite_score=final_score,
                    weights_json=active_weights.model_dump(),
                    breakdown_json=breakdown,
                )
                session.add(score_entry)

                pct = 40.0 + ((idx + 1) / total) * 45.0
                await self.jobs.update_job(
                    job_id,
                    progress=pct,
                    message=f"Scored {idx + 1} of {total} candidates (Score: {final_score}, Grade: {grade})...",
                )
                await asyncio.sleep(0)

            await session.commit()

        # Step 3: Complete
        await self.jobs.update_job(
            job_id,
            step_index=3,
            step_name="Finalizing Leaderboard Rankings",
            message=f"Successfully re-ranked {total} mural wall candidates.",
            progress=100.0,
        )

        duration = round(time.time() - start_time, 2)
        summary = {
            "status": "success",
            "total_candidates_scored": total,
            "weights_used": active_weights.model_dump(),
            "grade_distribution": grade_dist,
            "duration_seconds": duration,
        }

        return summary


scoring_engine_service = ScoringEngineService()
