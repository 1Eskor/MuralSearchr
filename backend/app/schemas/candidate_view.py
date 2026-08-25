from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CandidateViewDTO(BaseModel):
    id: int
    imagery_id: int
    candidate_id: Optional[int] = None
    view_heading: Optional[float] = None
    pitch: Optional[float] = None
    fov_degrees: Optional[float] = None
    crop_box_json: Optional[Dict[str, Any]] = None
    file_hash: str
    width: int
    height: int
    is_sliced_from_pano: bool
    raw_clip_score: Optional[float] = 0.0
    wall_detected: Optional[bool] = True
    preview_url: str
    created_at: datetime


class ViewGenerationRequest(BaseModel):
    imagery_ids: Optional[List[int]] = None
    headings_count: int = Field(default=4, ge=1, le=8)
    fov_degrees: float = Field(default=90.0, ge=45.0, le=120.0)
    resolution: int = Field(default=512, ge=256, le=1024)


class ViewGenerationResult(BaseModel):
    job_id: str
    status: str
    total_source_images: int
    total_views_generated: int
    duration_seconds: float
    views: List[CandidateViewDTO]


class ViewStatsResponse(BaseModel):
    total_views: int
    panoramic_slices: int
    flat_perspective_views: int
    unique_source_images: int
