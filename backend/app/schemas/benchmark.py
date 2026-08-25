from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class BenchmarkRequest(BaseModel):
    models: List[str] = Field(default=["openclip", "siglip2"])
    prompt_sets: List[str] = Field(default=["default_paintable", "blank_masonry", "high_prominence"])
    sample_limit: int = Field(default=50, ge=10, le=200)


class ModelBenchmarkScore(BaseModel):
    model_name: str
    display_name: str
    precision_at_10: float
    precision_at_25: float
    precision_at_50: float
    recall_at_50: float
    material_accuracy: float
    avg_latency_ms: float
    confusion_matrix: Dict[str, Dict[str, int]]
    prompt_scores: Dict[str, float]


class BenchmarkReportResponse(BaseModel):
    benchmark_id: str
    evaluated_images_count: int
    models_compared: List[ModelBenchmarkScore]
    winning_model: str
    winning_prompt_set: str
    analysis_summary: str
    created_at: datetime
