import asyncio
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import Settings, get_settings
from backend.app.core.database import async_session_factory
from backend.app.core.logging import logger
from backend.app.models.imagery import Imagery
from backend.app.models.search_area import SearchArea
from backend.app.providers.geodata.base import SamplePoint
from backend.app.providers.imagery.base import ImageryProvider, StreetImageMetadata
from backend.app.providers.registry import ProviderRegistry, registry
from backend.app.schemas.imagery import ImageryDTO, ImageryIngestResult
from backend.app.services.cache import ImageCacheManager, cache_manager
from backend.app.services.job_runner import JobManager, job_manager


class ImageryIngestionService:
    """
    Service coordinating the batch query, concurrent downloading,
    hashing, and database persistence of street-level imagery.
    """

    def __init__(
        self,
        provider_registry: Optional[ProviderRegistry] = None,
        image_cache: Optional[ImageCacheManager] = None,
        job_mgr: Optional[JobManager] = None,
        settings: Optional[Settings] = None,
    ):
        self.registry = provider_registry or registry
        self.cache = image_cache or cache_manager
        self.jobs = job_mgr or job_manager
        self.settings = settings or get_settings()

    async def ingest_for_points(
        self,
        job_id: str,
        sample_points: List[SamplePoint],
        max_images_per_point: int = 2,
        radius_meters: float = 25.0,
        provider_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute concurrent batch imagery ingestion for a list of candidate coordinates.
        """
        start_time = time.time()
        provider = self.registry.get_imagery_provider(provider_name)
        total_points = len(sample_points)

        await self.jobs.update_job(
            job_id,
            status="running",
            step_index=1,
            step_name="Querying Street Imagery Metadata",
            message=f"Querying {provider.get_info().name} for {total_points} candidate coordinates...",
            progress=10.0,
        )

        # 1. Query imagery metadata in concurrent batches with Semaphore
        sem = asyncio.Semaphore(8)

        async def _query_single_pt(pt: SamplePoint) -> List[StreetImageMetadata]:
            async with sem:
                try:
                    return await provider.query_images_near_coordinates(
                        lat=pt.latitude,
                        lon=pt.longitude,
                        radius_meters=radius_meters,
                        max_images=max_images_per_point,
                    )
                except Exception as e:
                    logger.warning(f"Failed query at ({pt.latitude}, {pt.longitude}): {e}")
                    return []

        query_tasks = [_query_single_pt(pt) for pt in sample_points]
        query_results = await asyncio.gather(*query_tasks)

        all_metas: List[StreetImageMetadata] = []
        for res in query_results:
            all_metas.extend(res)

        total_images = len(all_metas)
        logger.info(f"[{job_id}] Found {total_images} total street view images across {total_points} points.")

        await self.jobs.update_job(
            job_id,
            step_index=2,
            step_name="Downloading and Caching Imagery",
            message=f"Downloading and caching {total_images} photos with SHA-256 deduplication...",
            progress=40.0,
        )

        # 2. Download and cache images concurrently
        download_sem = asyncio.Semaphore(6)
        downloaded_records: List[Dict[str, Any]] = []
        total_bytes = 0

        async def _download_and_cache(idx: int, meta: StreetImageMetadata):
            nonlocal total_bytes
            async with download_sem:
                temp_file = self.settings.CACHE_DIR / "temp" / f"{meta.id}_{uuid.uuid4().hex[:6]}.jpg"
                try:
                    saved_path = await provider.download_image(meta, temp_file)
                    # Cache binary with hash deduplication
                    cache_result = await self.cache.save_file_copy(saved_path)
                    total_bytes += cache_result["size_bytes"]

                    downloaded_records.append(
                        {
                            "meta": meta,
                            "file_hash": cache_result["file_hash"],
                            "local_path": cache_result["local_path"],
                            "size_bytes": cache_result["size_bytes"],
                        }
                    )

                    # Periodically update progress
                    if idx % max(1, total_images // 5) == 0:
                        pct = 40.0 + (idx / total_images) * 45.0
                        await self.jobs.update_job(
                            job_id,
                            progress=pct,
                            message=f"Downloaded {len(downloaded_records)} of {total_images} photos...",
                        )
                except Exception as e:
                    logger.warning(f"Error downloading image {meta.id}: {e}")
                finally:
                    if temp_file.exists():
                        temp_file.unlink()

        download_tasks = [_download_and_cache(i, m) for i, m in enumerate(all_metas)]
        await asyncio.gather(*download_tasks)

        await self.jobs.update_job(
            job_id,
            step_index=3,
            step_name="Persisting Records to Database",
            message=f"Saving {len(downloaded_records)} image records into SQLite database...",
            progress=90.0,
        )

        # 3. Persist records to database
        saved_imagery_dtos: List[Dict[str, Any]] = []

        async with async_session_factory() as session:
            for item in downloaded_records:
                meta = item["meta"]
                file_hash = item["file_hash"]
                local_path = item["local_path"]

                # Check if already exists in DB
                stmt = select(Imagery).where(Imagery.file_hash == file_hash)
                existing = (await session.execute(stmt)).scalar_one_or_none()

                if not existing:
                    img_row = Imagery(
                        provider=meta.provider,
                        external_id=meta.id,
                        latitude=meta.latitude,
                        longitude=meta.longitude,
                        heading=meta.heading,
                        pitch=meta.pitch,
                        capture_date=meta.capture_date or datetime.datetime.utcnow(),
                        source_url=meta.source_url,
                        local_path=local_path,
                        file_hash=file_hash,
                        width=meta.width or 1024,
                        height=meta.height or 768,
                        is_cached=True,
                        metadata_json=meta.extra_metadata,
                    )
                    session.add(img_row)
                    await session.flush()
                    await session.refresh(img_row)
                    saved_row = img_row
                else:
                    saved_row = existing

                saved_imagery_dtos.append(
                    {
                        "id": saved_row.id,
                        "provider": saved_row.provider,
                        "external_id": saved_row.external_id,
                        "latitude": saved_row.latitude,
                        "longitude": saved_row.longitude,
                        "heading": saved_row.heading,
                        "capture_date": saved_row.capture_date.isoformat() if saved_row.capture_date else None,
                        "source_url": saved_row.source_url,
                        "file_hash": saved_row.file_hash,
                        "width": saved_row.width,
                        "height": saved_row.height,
                        "is_cached": saved_row.is_cached,
                        "preview_url": f"/api/cache/images/{saved_row.file_hash}",
                    }
                )

            await session.commit()

        duration = round(time.time() - start_time, 2)
        summary = {
            "status": "success",
            "total_points_queried": total_points,
            "total_images_ingested": len(saved_imagery_dtos),
            "total_bytes_cached": total_bytes,
            "duration_seconds": duration,
            "images": saved_imagery_dtos[:30],  # Return first 30 for response summary
        }

        return summary


ingestion_service = ImageryIngestionService()
