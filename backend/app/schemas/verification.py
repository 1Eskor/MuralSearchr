from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class VerificationRequest(BaseModel):
    candidate_ids: Optional[List[int]] = None
    model: str = Field(default="gpt-4o-mini", description="OpenAI vision model name (gpt-4o-mini / gpt-4o)")


class VerificationStatusResponse(BaseModel):
    openai_configured: bool
    active_model: str
    total_verified_candidates: int
    avg_consensus_agreement_pct: float
    estimated_cost_usd: float
