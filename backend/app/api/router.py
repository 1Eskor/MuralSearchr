from fastapi import APIRouter
from backend.app.api.routes import (
    analysis,
    benchmark,
    cache,
    candidate_views,
    candidates,
    config,
    deduplication,
    export,
    geodata,
    health,
    imagery,
    jobs,
    pipeline,
    ranking,
    scoring,
    search_areas,
    verification,
)

api_router = APIRouter(prefix="/api")

api_router.include_router(health.router)
api_router.include_router(config.router)
api_router.include_router(geodata.router)
api_router.include_router(imagery.router)
api_router.include_router(candidate_views.router)
api_router.include_router(ranking.router)
api_router.include_router(candidates.router)
api_router.include_router(analysis.router)
api_router.include_router(verification.router)
api_router.include_router(scoring.router)
api_router.include_router(deduplication.router)
api_router.include_router(export.router)
api_router.include_router(benchmark.router)
api_router.include_router(search_areas.router)
api_router.include_router(jobs.router)
api_router.include_router(cache.router)
api_router.include_router(pipeline.router)
