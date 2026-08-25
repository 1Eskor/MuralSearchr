from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class JobCreateRequest(BaseModel):
    job_type: str = "pipeline_search"
    total_steps: int = 5
    params: Optional[Dict[str, Any]] = None


class JobLogEntry(BaseModel):
    timestamp: str
    message: str
    step: str


class JobResponse(BaseModel):
    job_id: str
    job_type: str
    status: str
    progress: float
    current_step: str
    total_steps: int
    current_step_index: int
    message: Optional[str] = None
    error_details: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    result_summary: Optional[Dict[str, Any]] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: str
    updated_at: str
    logs: Optional[List[Dict[str, str]]] = None
