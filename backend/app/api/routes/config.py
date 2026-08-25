from fastapi import APIRouter
from backend.app.core.config import get_settings
from backend.app.providers.registry import registry
from backend.app.schemas.common import APIResponse
from backend.app.schemas.config import ConfigOverview
from backend.app.services.cache import cache_manager

router = APIRouter(prefix="/config", tags=["Configuration"])


@router.get("", response_model=APIResponse[ConfigOverview])
async def get_configuration():
    settings = get_settings()
    stats = cache_manager.get_stats()

    overview = ConfigOverview(
        app_name=settings.APP_NAME,
        environment=settings.APP_ENV,
        detected_device=settings.detected_device,
        scoring_weights=settings.scoring_weights,
        active_providers={
            "geodata": settings.GEODATA_PROVIDER,
            "imagery": settings.IMAGERY_PROVIDER,
            "vision_ranker": settings.VISION_RANKER_PROVIDER,
            "vision_analyzer": settings.VISION_ANALYZER_PROVIDER,
            "exposure": settings.EXPOSURE_PROVIDER,
        },
        all_providers=registry.list_all_providers(),
        cache_settings={
            "cache_dir": stats["cache_dir"],
            "max_mb": stats["max_mb"],
            "total_files": stats["total_files"],
            "total_mb": stats["total_mb"],
            "usage_percent": stats["usage_percent"],
        },
    )

    return APIResponse(data=overview, message="Configuration retrieved")
