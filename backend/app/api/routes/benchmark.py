from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException

from backend.app.schemas.benchmark import BenchmarkReportResponse, BenchmarkRequest
from backend.app.schemas.common import APIResponse
from backend.app.schemas.job import JobResponse
from backend.app.services.benchmark import benchmark_service
from backend.app.services.job_runner import job_manager

router = APIRouter(prefix="/benchmark", tags=["Vision Model Benchmark"])


@router.post("/run", response_model=APIResponse[JobResponse])
async def run_model_benchmark(req: BenchmarkRequest):
    """
    Trigger an empirical benchmark run evaluating SigLIP 2 vs OpenCLIP
    against the standardized ground-truth labeled evaluation dataset.
    """
    job_id = job_manager.create_job(
        job_type="model_benchmark",
        total_steps=3,
        params=req.model_dump(),
    )

    job_manager.start_background_task(
        job_id,
        benchmark_service.run_benchmark,
        models=req.models,
        prompt_sets=req.prompt_sets,
    )

    job_data = job_manager.get_job(job_id)
    return APIResponse(
        data=job_data,
        message=f"Model benchmark job started with ID: {job_id}",
    )


@router.get("/latest", response_model=APIResponse[BenchmarkReportResponse])
async def get_latest_benchmark_report():
    """
    Retrieve latest empirical model benchmark comparison report.
    """
    report = benchmark_service.get_latest_report()
    return APIResponse(
        data=report,
        message="Latest model benchmark report retrieved",
    )


@router.get("/models", response_model=APIResponse[List[Dict[str, Any]]])
async def list_benchmark_models():
    """
    List selectable vision ranking models for live prospecting and benchmarking.
    """
    models = [
        {
            "id": "siglip2",
            "name": "Google SigLIP 2 (ViT-B-16-SigLIP2)",
            "architecture": "SigLIP 2",
            "weights": "webli",
            "description": "Next-generation vision-language model with superior blank canvas contrast & fine-grained material discrimination",
            "is_default": True,
        },
        {
            "id": "openclip",
            "name": "OpenCLIP (ViT-B-32)",
            "architecture": "CLIP",
            "weights": "laion2b_s34b_b79k",
            "description": "Standard OpenCLIP vision ranker with fast inference latency",
            "is_default": False,
        },
    ]
    return APIResponse(data=models, message="Available vision benchmark models listed")
