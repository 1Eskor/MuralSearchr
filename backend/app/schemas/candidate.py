from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from backend.app.schemas.candidate_view import CandidateViewDTO


class CandidateDTO(BaseModel):
    id: int
    search_area_id: Optional[int] = None
    latitude: float
    longitude: float
    address: Optional[str] = None
    best_image_id: Optional[int] = None
    primary_view_id: Optional[int] = None
    view_count: int = 1
    overall_score: float = 0.0
    wall_score: float = 0.0
    blankness_score: float = 0.0
    visibility_score: float = 0.0
    access_score: float = 0.0
    confidence_score: float = 0.0
    estimated_size: str = "medium"
    wall_material: Optional[str] = None
    existing_artwork: bool = False
    primary_view_preview_url: Optional[str] = None
    primary_view_heading: Optional[float] = None
    primary_view_clip_score: Optional[float] = 0.0
    created_at: datetime


class CandidateDetailDTO(CandidateDTO):
    views: List[CandidateViewDTO] = []
    analysis_json: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


class ReductionRequest(BaseModel):
    min_score: float = Field(default=0.50, ge=0.0, le=1.0)
    top_percentile: float = Field(default=0.20, ge=0.05, le=1.0)
    cluster_distance_meters: float = Field(default=15.0, ge=5.0, le=50.0)
    max_candidates: int = Field(default=50, ge=1, le=200)
    excluded_materials: Optional[List[str]] = Field(default=None)


class ReductionResult(BaseModel):
    job_id: str
    total_input_views: int
    qualifying_views: int
    promoted_candidates_count: int
    reduction_rate_pct: float
    duration_seconds: float
    candidates: List[CandidateDTO]


class FunnelStatsResponse(BaseModel):
    total_geodata_points: int
    total_imagery_photos: int
    total_perspective_views: int
    total_clip_ranked: int
    promoted_candidates: int
    noise_reduction_pct: float
    vlm_api_calls_saved: int
    estimated_dollars_saved: float
