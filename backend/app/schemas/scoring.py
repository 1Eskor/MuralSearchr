from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from backend.app.schemas.candidate import CandidateDTO


class ScoringWeightsDTO(BaseModel):
    wall_quality_weight: float = Field(default=0.30, ge=0.0, le=1.0)
    blankness_weight: float = Field(default=0.25, ge=0.0, le=1.0)
    visibility_weight: float = Field(default=0.20, ge=0.0, le=1.0)
    accessibility_weight: float = Field(default=0.15, ge=0.0, le=1.0)
    confidence_weight: float = Field(default=0.10, ge=0.0, le=1.0)
    obstruction_penalty_factor: float = Field(default=25.0, ge=0.0, le=100.0)
    existing_artwork_penalty: float = Field(default=40.0, ge=0.0, le=100.0)


class ScoreBreakdownDTO(BaseModel):
    wall_quality_component: float
    blankness_component: float
    visibility_component: float
    accessibility_component: float
    confidence_component: float
    base_sum: float
    obstruction_penalty: float
    artwork_penalty: float
    final_score: float
    grade: str


class ScoringRecalculateRequest(BaseModel):
    weights: Optional[ScoringWeightsDTO] = None


class ScoringLeaderboardItem(CandidateDTO):
    grade: str = "A"
    breakdown: Optional[ScoreBreakdownDTO] = None


class ScoringStatsResponse(BaseModel):
    total_scored: int
    grade_distribution: Dict[str, int]
    avg_overall_score: float
    active_weights: ScoringWeightsDTO
    formula_description: str
