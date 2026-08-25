from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class RankingRequest(BaseModel):
    view_ids: Optional[List[int]] = None
    provider: Optional[str] = "openclip"
    positive_prompts: Optional[List[str]] = None
    negative_prompts: Optional[List[str]] = None
    batch_size: int = Field(default=16, ge=1, le=64)


class PromptConfigDTO(BaseModel):
    positive_prompts: List[str]
    negative_prompts: List[str]


class RankingStatsResponse(BaseModel):
    total_ranked_views: int
    passed_count: int
    rejected_count: int
    pass_rate_pct: float
    histogram: Dict[str, int]
    model_name: str
    device: str
