from typing import Any, Dict, Optional
from fastapi import APIRouter
from pydantic import BaseModel
from backend.app.schemas.common import APIResponse
from backend.app.schemas.job import JobResponse
from backend.app.services.job_runner import job_manager
from backend.app.services.pipeline import pipeline_service

router = APIRouter(prefix="/pipeline", tags=["Pipeline"])


class DryRunRequest(BaseModel):
    polygon_geojson: Optional[Dict[str, Any]] = None


@router.post("/dry-run", response_model=APIResponse[JobResponse])
async def trigger_dry_run(request: Optional[DryRunRequest] = None):
    poly = request.polygon_geojson if request else None

    # Create background job
    job_id = job_manager.create_job(job_type="pipeline_dry_run", total_steps=5, params={"polygon": poly})

    # Start background task
    job_manager.start_background_task(job_id, pipeline_service.execute_dry_run, polygon_geojson=poly)

    job_data = job_manager.get_job(job_id)
    return APIResponse(data=job_data, message=f"Pipeline dry-run job started with ID: {job_id}")
