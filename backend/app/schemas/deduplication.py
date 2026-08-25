from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from backend.app.schemas.candidate import CandidateDetailDTO


class DeduplicationRequest(BaseModel):
    spatial_radius_meters: float = Field(default=15.0, ge=5.0, le=50.0)
    visual_sim_threshold: float = Field(default=0.90, ge=0.70, le=0.99)


class DeduplicationStatsResponse(BaseModel):
    initial_candidates: int
    unique_canonical_walls: int
    duplicates_merged: int
    reduction_rate_pct: float
    multi_view_walls_count: int
    multi_view_pct: float


class ClusteredWallDTO(CandidateDetailDTO):
    multi_view_headings: List[float] = []
