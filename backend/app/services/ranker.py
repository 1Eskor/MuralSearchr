import asyncio
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import Settings, get_settings
from backend.app.core.database import async_session_factory
from backend.app.core.logging import logger
from backend.app.models.candidate import CandidateView
from backend.app.providers.registry import ProviderRegistry, registry
from backend.app.providers.vision.openclip import DEFAULT_NEGATIVE_PROMPTS, DEFAULT_POSITIVE_PROMPTS
from backend.app.services.cache import ImageCacheManager, cache_manager
from backend.app.services.job_runner import JobManager, job_manager


class VisionRankingService:
    """
    Service managing batch zero-shot Vision-Language ranking (OpenCLIP / SigLIP)
    over candidate perspective views.
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

    async def rank_candidate_views(
        self,
        job_id: str,
        view_ids: Optional[List[int]] = None,
        provider_name: Optional[str] = "openclip",
        positive_prompts: Optional[List[str]] = None,
        negative_prompts: Optional[List[str]] = None,
        batch_size: int = 16,
    ) -> Dict[str, Any]:
        """
        Batch score candidate views against positive/negative prompt ensembles.
        """
        start_time = time.time()
        ranker = self.registry.get_vision_ranker(provider_name)
        pos_prompts = positive_prompts or DEFAULT_POSITIVE_PROMPTS
        neg_prompts = negative_prompts or DEFAULT_NEGATIVE_PROMPTS

        await self.jobs.update_job(
            job_id,
            status="running",
            step_index=1,
            step_name="Loading Candidate Views",
            message="Querying candidate perspective views for AI ranking...",
            progress=10.0,
        )

        async with async_session_factory() as session:
            stmt = select(CandidateView)
            if view_ids:
                stmt = stmt.where(CandidateView.id.in_(view_ids))
            stmt = stmt.order_by(CandidateView.id.desc()).limit(200)
            res = await session.execute(stmt)
            views = list(res.scalars().all())

        if not views:
            return {
                "status": "completed",
                "total_views_ranked": 0,
                "duration_seconds": 0.0,
                "passed_count": 0,
                "rejected_count": 0,
                "histogram": {},
                "top_views": [],
            }

        total_views = len(views)
        await self.jobs.update_job(
            job_id,
            step_index=2,
            step_name="Running Local Vision Ranking",
            message=f"Scoring {total_views} perspective views with {ranker.get_info().name}...",
            progress=25.0,
        )

        ranked_results: List[Dict[str, Any]] = []
        histogram = {"0.0-0.2": 0, "0.2-0.4": 0, "0.4-0.6": 0, "0.6-0.8": 0, "0.8-1.0": 0}
        passed_count = 0
        rejected_count = 0

        # Process in batches
        for i in range(0, total_views, batch_size):
            chunk = views[i : i + batch_size]
            view_path_pairs = []
            for view in chunk:
                cached_file = await self.cache.get_image_path(view.file_hash)
                if cached_file and cached_file.exists():
                    view_path_pairs.append((view, cached_file))

            if view_path_pairs:
                paths = [p for _, p in view_path_pairs]
                rank_results = await ranker.rank_images(
                    image_paths=paths,
                    positive_prompts=pos_prompts,
                    negative_prompts=neg_prompts,
                    batch_size=len(paths),
                )

                for (view, _), rank_res in zip(view_path_pairs, rank_results):
                    score = rank_res.raw_score
                    is_wall = rank_res.wall_detected

                    if is_wall:
                        passed_count += 1
                    else:
                        rejected_count += 1

                    # Update histogram bracket
                    if score < 0.2:
                        histogram["0.0-0.2"] += 1
                    elif score < 0.4:
                        histogram["0.2-0.4"] += 1
                    elif score < 0.6:
                        histogram["0.4-0.6"] += 1
                    elif score < 0.8:
                        histogram["0.6-0.8"] += 1
                    else:
                        histogram["0.8-1.0"] += 1

                    ranked_results.append(
                        {
                            "view_id": view.id,
                            "raw_clip_score": score,
                            "wall_detected": is_wall,
                            "breakdown": rank_res.breakdown,
                        }
                    )

            # Update progress
            pct = 25.0 + ((i + len(chunk)) / total_views) * 60.0
            throughput = round((i + len(chunk)) / max(0.1, time.time() - start_time), 1)
            await self.jobs.update_job(
                job_id,
                progress=pct,
                message=f"Ranked {len(ranked_results)} of {total_views} views ({throughput} views/sec)...",
            )
            await asyncio.sleep(0)

        await self.jobs.update_job(
            job_id,
            step_index=3,
            step_name="Persisting Scores to Database",
            message=f"Saving CLIP scores for {len(ranked_results)} candidate views in SQLite...",
            progress=90.0,
        )

        # Update database records
        async with async_session_factory() as session:
            for item in ranked_results:
                stmt = select(CandidateView).where(CandidateView.id == item["view_id"])
                v_row = (await session.execute(stmt)).scalar_one_or_none()
                if v_row:
                    v_row.raw_clip_score = item["raw_clip_score"]
                    v_row.wall_detected = item["wall_detected"]
                    v_row.analysis_summary = item["breakdown"]
            await session.commit()

        duration = round(time.time() - start_time, 2)
        summary = {
            "status": "success",
            "total_views_ranked": len(ranked_results),
            "passed_count": passed_count,
            "rejected_count": rejected_count,
            "pass_rate_pct": round((passed_count / max(1, len(ranked_results))) * 100.0, 1),
            "duration_seconds": duration,
            "histogram": histogram,
            "positive_prompts_used": pos_prompts,
            "negative_prompts_used": neg_prompts,
        }

        return summary


vision_ranking_service = VisionRankingService()
