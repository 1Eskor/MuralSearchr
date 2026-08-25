from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db
from backend.app.models.imagery import Imagery
from backend.app.models.candidate import CandidateView
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
async def get_cached_image(file_hash: str, db: AsyncSession = Depends(get_db)):
    """
    Serve a cached image by its SHA-256 hash.
    Lookup order:
      1. Sharded cache directory: cache/<prefix>/<hash>.jpg
      2. Wildcard glob of entire cache dir for partial matches
      3. DB imagery.local_path for any row with matching file_hash
      4. DB candidate_views.local_path for any row with matching file_hash
      5. Redirect to imagery source_url (Mapillary CDN) if available
    """
    # 1. Standard sharded path (hash[:2] / hash.jpg)
    image_path = await cache_manager.get_image_path(file_hash)
    if image_path and image_path.exists():
        return FileResponse(image_path, media_type="image/jpeg")

    # 2. Wildcard glob fallback
    direct = list(cache_manager.cache_dir.rglob(f"*{file_hash}*.jpg"))
    if direct and direct[0].exists():
        return FileResponse(direct[0], media_type="image/jpeg")

    # 3. DB lookup from imagery table
    stmt = select(Imagery).where(Imagery.file_hash == file_hash).limit(1)
    img_row = (await db.execute(stmt)).scalar_one_or_none()
    if img_row:
        if img_row.local_path:
            p = Path(img_row.local_path)
            if p.exists():
                return FileResponse(p, media_type="image/jpeg")
        # Redirect to live CDN URL as last resort
        if img_row.source_url and img_row.source_url.startswith("http") and "mock" not in img_row.source_url:
            return RedirectResponse(url=img_row.source_url, status_code=302)

    # 4. DB lookup from candidate_views table
    stmt2 = select(CandidateView).where(CandidateView.file_hash == file_hash).limit(1)
    view_row = (await db.execute(stmt2)).scalar_one_or_none()
    if view_row and view_row.local_path:
        p2 = Path(view_row.local_path)
        if p2.exists():
            return FileResponse(p2, media_type="image/jpeg")
        # Try to get source URL from the parent imagery row
        if view_row.imagery_id:
            stmt3 = select(Imagery).where(Imagery.id == view_row.imagery_id).limit(1)
            src_row = (await db.execute(stmt3)).scalar_one_or_none()
            if src_row and src_row.source_url and src_row.source_url.startswith("http") and "mock" not in src_row.source_url:
                return RedirectResponse(url=src_row.source_url, status_code=302)

    raise HTTPException(status_code=404, detail="Image not found in cache")
