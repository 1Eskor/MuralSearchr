from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse
from backend.app.schemas.common import APIResponse
from backend.app.schemas.job import JobResponse
from backend.app.services.job_runner import job_manager

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.get("", response_model=APIResponse[List[JobResponse]])
async def list_jobs(limit: int = Query(default=20, ge=1, le=100)):
    jobs = job_manager.list_jobs(limit=limit)
    return APIResponse(data=jobs, message="Jobs listed successfully")


@router.get("/stream")
async def stream_all_jobs():
    """Server-Sent Events stream for all background job updates."""
    return EventSourceResponse(job_manager.subscribe_global())


@router.get("/{job_id}", response_model=APIResponse[JobResponse])
async def get_job(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return APIResponse(data=job, message="Job found")


@router.get("/{job_id}/events")
async def stream_job_events(job_id: str):
    """Server-Sent Events stream for a specific job."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return EventSourceResponse(job_manager.subscribe_job(job_id))


@router.post("/{job_id}/cancel", response_model=APIResponse[dict])
async def cancel_job(job_id: str):
    success = job_manager.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=400, detail="Job could not be cancelled or is not active")
    return APIResponse(data={"job_id": job_id, "status": "cancelled"}, message="Job cancellation requested")
