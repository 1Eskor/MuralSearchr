from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.app.schemas.cache import CachePurgeResponse, CacheStatsResponse
from backend.app.schemas.common import APIResponse
from backend.app.services.cache import cache_manager

router = APIRouter(prefix="/cache", tags=["Cache"])


@router.get("/stats", response_model=APIResponse[CacheStatsResponse])
async def get_cache_stats():
    stats = cache_manager.get_stats()
    return APIResponse(data=stats, message="Cache stats retrieved")


@router.post("/clear", response_model=APIResponse[CachePurgeResponse])
async def clear_cache():
    cleared = cache_manager.clear_cache()
    return APIResponse(
        data=CachePurgeResponse(cleared_items=cleared, message=f"Purged {cleared} cache items"),
        message="Cache cleared",
    )


@router.get("/images/{file_hash}")
async def get_cached_image(file_hash: str):
    image_path = await cache_manager.get_image_path(file_hash)
    if not image_path or not image_path.exists():
        # Check if direct match in cache directory
        direct = list(cache_manager.cache_dir.rglob(f"*{file_hash}*.jpg"))
        if direct and direct[0].exists():
            return FileResponse(direct[0], media_type="image/jpeg")
        raise HTTPException(status_code=404, detail="Image not found in cache")

    return FileResponse(image_path, media_type="image/jpeg")
