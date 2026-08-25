from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from backend.app.schemas.candidate import CandidateDTO


class AnalysisRequest(BaseModel):
    candidate_ids: Optional[List[int]] = None
    provider: Optional[str] = "local_vlm"


class AnalysisStatsResponse(BaseModel):
    total_analyzed: int
    materials_breakdown: Dict[str, int]
    size_classes_breakdown: Dict[str, int]
    artwork_detected_count: int
    avg_blankness_pct: float
    avg_quality_pct: float
    model_name: str
