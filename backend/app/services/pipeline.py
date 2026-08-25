import asyncio
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from backend.app.core.config import Settings, get_settings
from backend.app.core.logging import logger
from backend.app.providers.registry import ProviderRegistry, registry
from backend.app.services.cache import ImageCacheManager, cache_manager
from backend.app.services.job_runner import JobManager, job_manager


class PipelineService:
    """
    Decoupled Orchestration Service for Mural Search prospecting workflows.
    Executes the multi-stage pipeline across provider interfaces.
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

    async def execute_dry_run(self, job_id: str, polygon_geojson: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Executes an end-to-end Phase 1 dry-run pipeline test verifying all layers:
        1. Geodata sample coordinate extraction
        2. Imagery querying & local caching with SHA-256 deduplication
        3. Stage 1 Vision ranking simulation
        4. Stage 2 Vision analysis simulation
        5. Composite score calculation
        """
        start_time = time.time()
        poly = polygon_geojson or {
            "type": "Polygon",
            "coordinates": [
                [
                    [-74.0080, 40.7110],
                    [-74.0040, 40.7110],
                    [-74.0040, 40.7150],
                    [-74.0080, 40.7150],
                    [-74.0080, 40.7110],
                ]
            ],
        }

        # Step 1: Geodata Extraction
        await self.jobs.update_job(
            job_id,
            step_index=1,
            step_name="Extracting Road Network & Sampling Points",
            message="Querying geodata provider for roads and building footprints...",
        )
        geo_provider = self.registry.get_geodata_provider()
        sample_points = await geo_provider.generate_sample_points(poly, step_distance_meters=25.0)
        logger.info(f"[{job_id}] Generated {len(sample_points)} sample points from geodata provider.")
        await asyncio.sleep(0.4)

        # Step 2: Imagery Query & Ingestion
        await self.jobs.update_job(
            job_id,
            step_index=2,
            step_name="Querying Street-Level Imagery",
            message=f"Querying imagery provider for {len(sample_points)} candidate points...",
        )
        imagery_provider = self.registry.get_imagery_provider()
        all_image_metas = []
        for pt in sample_points[:6]:  # Test sample subset
            metas = await imagery_provider.query_images_near_coordinates(pt.latitude, pt.longitude, radius_meters=25.0)
            all_image_metas.extend(metas)
        await asyncio.sleep(0.4)

        # Step 3: Local Filesystem Image Caching
        await self.jobs.update_job(
            job_id,
            step_index=3,
            step_name="Ingesting and Caching Images",
            message=f"Downloading and caching {len(all_image_metas)} street view images...",
        )
        cached_paths: List[Path] = []
        for meta in all_image_metas:
            temp_dest = self.settings.CACHE_DIR / "temp" / f"{meta.id}.jpg"
            downloaded = await imagery_provider.download_image(meta, temp_dest)
            # Cache binary with hash deduplication
            cache_result = await self.cache.save_file_copy(downloaded)
            cached_paths.append(Path(cache_result["local_path"]))
            # Clean up temp file
            if temp_dest.exists():
                temp_dest.unlink()
        await asyncio.sleep(0.4)

        # Step 4: Stage 1 Fast Vision Ranking
        await self.jobs.update_job(
            job_id,
            step_index=4,
            step_name="Stage 1 Vision Ranking (CLIP/SigLIP)",
            message=f"Ranking {len(cached_paths)} images against positive & negative wall prompts...",
        )
        vision_ranker = self.registry.get_vision_ranker()
        rank_results = await vision_ranker.rank_images(cached_paths)
        top_candidates = rank_results[: min(3, len(rank_results))]
        await asyncio.sleep(0.4)

        # Step 5: Stage 2 Detailed Vision Analysis & Scoring
        await self.jobs.update_job(
            job_id,
            step_index=5,
            step_name="Stage 2 Vision Analysis & Scoring",
            message=f"Analyzing top {len(top_candidates)} wall candidates with structured VLM...",
        )
        vision_analyzer = self.registry.get_vision_analyzer()
        candidates_output = []
        weights = self.settings.scoring_weights

        for rank_item in top_candidates:
            attrs = await vision_analyzer.analyze_wall(rank_item.image_path)
            # Compute composite mural score (0-100)
            # M = 0.30W + 0.25B + 0.20V + 0.15A + 0.10C
            composite = (
                weights["wall"] * (attrs.wall_quality * 100)
                + weights["blankness"] * (attrs.blankness * 100)
                + weights["visibility"] * (attrs.visibility * 100)
                + weights["accessibility"] * (attrs.accessibility * 100)
                + weights["confidence"] * (attrs.confidence * 100)
            )

            candidates_output.append(
                {
                    "image_id": rank_item.image_id,
                    "overall_score": round(composite, 1),
                    "wall_score": round(attrs.wall_quality * 100, 1),
                    "blankness_score": round(attrs.blankness * 100, 1),
                    "visibility_score": round(attrs.visibility * 100, 1),
                    "access_score": round(attrs.accessibility * 100, 1),
                    "confidence_score": round(attrs.confidence * 100, 1),
                    "estimated_size": attrs.size_class,
                    "reason": attrs.reason,
                    "cached_image_url": f"/api/cache/images/{rank_item.image_id}",
                }
            )

        duration = round(time.time() - start_time, 2)
        summary = {
            "status": "success",
            "duration_seconds": duration,
            "sample_points_generated": len(sample_points),
            "images_ingested": len(cached_paths),
            "candidates_found": len(candidates_output),
            "top_candidate_score": candidates_output[0]["overall_score"] if candidates_output else 0.0,
            "candidates": candidates_output,
            "weights_used": weights,
            "device_used": self.settings.detected_device,
        }

        return summary


pipeline_service = PipelineService()
