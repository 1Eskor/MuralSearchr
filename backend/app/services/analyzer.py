import asyncio
import time
from typing import Any, Dict, List, Optional
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.config import Settings, get_settings
from backend.app.core.database import async_session_factory
from backend.app.core.logging import logger
from backend.app.models.candidate import Candidate, CandidateView
from backend.app.providers.registry import ProviderRegistry, registry
from backend.app.providers.vision.base import WallAttributes
from backend.app.services.cache import ImageCacheManager, cache_manager
from backend.app.services.job_runner import JobManager, job_manager


class VisionAnalysisService:
    """
    Service managing deep structured Vision-Language Model analysis (Local VLM)
    over promoted wall candidate entities.
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

    async def analyze_candidates_batch(
        self,
        job_id: str,
        candidate_ids: Optional[List[int]] = None,
        provider_name: Optional[str] = "local_vlm",
    ) -> Dict[str, Any]:
        """
        Batch extract structured wall suitability attributes for promoted candidates.
        """
        start_time = time.time()
        analyzer = self.registry.get_vision_analyzer(provider_name)

        await self.jobs.update_job(
            job_id,
            status="running",
            step_index=1,
            step_name="Querying Promoted Wall Candidates",
            message="Loading wall candidates and primary views from SQLite...",
            progress=15.0,
        )

        async with async_session_factory() as session:
            stmt = select(Candidate).options(selectinload(Candidate.views))
            if candidate_ids:
                stmt = stmt.where(Candidate.id.in_(candidate_ids))
            stmt = stmt.order_by(desc(Candidate.overall_score)).limit(50)
            res = await session.execute(stmt)
            candidates = list(res.scalars().all())

        total_cands = len(candidates)
        if total_cands == 0:
            return {
                "status": "completed",
                "total_candidates_analyzed": 0,
                "duration_seconds": 0.0,
                "results": [],
            }

        await self.jobs.update_job(
            job_id,
            step_index=2,
            step_name="Running Local VLM Structured Analysis",
            message=f"Extracting paintability attributes for {total_cands} candidates with {analyzer.get_info().name}...",
            progress=30.0,
        )

        analyzed_records: List[Dict[str, Any]] = []

        for idx, cand in enumerate(candidates):
            # Find primary view or first view
            primary_view = next((v for v in cand.views if v.id == cand.primary_view_id), None)
            if not primary_view and cand.views:
                primary_view = cand.views[0]

            if not primary_view or not primary_view.file_hash:
                continue

            img_path = await self.cache.get_image_path(primary_view.file_hash)
            if not img_path or not img_path.exists():
                continue

            # Run structured VLM analysis
            wall_attr = await analyzer.analyze_wall(
                image_path=img_path,
                context={
                    "candidate_id": cand.id,
                    "latitude": cand.latitude,
                    "longitude": cand.longitude,
                    "view_heading": primary_view.view_heading,
                },
            )

            # Store update data
            analyzed_records.append(
                {
                    "candidate_id": cand.id,
                    "wall_score": round(wall_attr.wall_quality * 100.0, 1),
                    "blankness_score": round(wall_attr.blankness * 100.0, 1),
                    "visibility_score": round(wall_attr.visibility * 100.0, 1),
                    "access_score": round(wall_attr.accessibility * 100.0, 1),
                    "confidence_score": round(wall_attr.confidence * 100.0, 1),
                    "wall_material": wall_attr.wall_material,
                    "estimated_size": wall_attr.size_class,
                    "existing_artwork": wall_attr.existing_artwork,
                    "notes": wall_attr.reason,
                    "analysis_json": wall_attr.model_dump(),
                }
            )

            # Update progress
            pct = 30.0 + ((idx + 1) / total_cands) * 55.0
            await self.jobs.update_job(
                job_id,
                progress=pct,
                message=f"Analyzed {idx + 1} of {total_cands} wall candidates...",
            )
            await asyncio.sleep(0)

        # Step 3: Persist updates to SQLite
        await self.jobs.update_job(
            job_id,
            step_index=3,
            step_name="Persisting Attributes to Database",
            message=f"Saving detailed VLM attributes for {len(analyzed_records)} candidates in SQLite...",
            progress=90.0,
        )

        async with async_session_factory() as session:
            for item in analyzed_records:
                stmt_c = select(Candidate).where(Candidate.id == item["candidate_id"])
                cand_db = (await session.execute(stmt_c)).scalar_one_or_none()
                if cand_db:
                    cand_db.wall_score = item["wall_score"]
                    cand_db.blankness_score = item["blankness_score"]
                    cand_db.visibility_score = item["visibility_score"]
                    cand_db.access_score = item["access_score"]
                    cand_db.confidence_score = item["confidence_score"]
                    cand_db.wall_material = item["wall_material"]
                    cand_db.estimated_size = item["estimated_size"]
                    cand_db.existing_artwork = item["existing_artwork"]
                    cand_db.notes = item["notes"]
                    cand_db.analysis_json = item["analysis_json"]
            await session.commit()

        duration = round(time.time() - start_time, 2)
        summary = {
            "status": "success",
            "total_candidates_analyzed": len(analyzed_records),
            "duration_seconds": duration,
            "materials_breakdown": {
                "brick": sum(1 for r in analyzed_records if r["wall_material"] == "brick"),
                "concrete": sum(1 for r in analyzed_records if r["wall_material"] == "concrete"),
                "stucco": sum(1 for r in analyzed_records if r["wall_material"] == "stucco"),
                "masonry": sum(1 for r in analyzed_records if r["wall_material"] == "masonry"),
            },
            "artwork_detected_count": sum(1 for r in analyzed_records if r["existing_artwork"]),
        }

        return summary


vision_analysis_service = VisionAnalysisService()
