from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SearchFilterParams(BaseModel):
    min_score: float = Field(default=0.0, ge=0.0, le=100.0)
    max_score: float = Field(default=100.0, ge=0.0, le=100.0)
    grade: Optional[str] = None
    wall_material: Optional[str] = None
    size_class: Optional[str] = None
    min_blankness: float = Field(default=0.0, ge=0.0, le=100.0)
    min_visibility: float = Field(default=0.0, ge=0.0, le=100.0)
    verified_only: bool = False
    query_text: Optional[str] = None


class ExecutiveDossierResponse(BaseModel):
    title: str
    version: str
    summary_metrics: Dict[str, Any]
    top_recommended_walls: List[Dict[str, Any]]
    methodology: Dict[str, Any]
