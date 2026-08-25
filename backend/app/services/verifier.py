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


class OpenAIVerificationService:
    """
    Service managing optional second-stage OpenAI vision verification for mural wall candidates.
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

    async def verify_candidates_batch(
        self,
        job_id: str,
        candidate_ids: Optional[List[int]] = None,
        model: str = "gpt-4o-mini",
    ) -> Dict[str, Any]:
        """
        Runs second-stage OpenAI verification over selected wall candidates.
        """
        start_time = time.time()
        analyzer = self.registry.get_vision_analyzer("openai")

        await self.jobs.update_job(
            job_id,
            status="running",
            step_index=1,
            step_name="Loading Candidates for Verification",
            message="Retrieving candidate views and local VLM baselines from SQLite...",
            progress=15.0,
        )

        async with async_session_factory() as session:
            stmt = select(Candidate).options(selectinload(Candidate.views))
            if candidate_ids:
                stmt = stmt.where(Candidate.id.in_(candidate_ids))
            stmt = stmt.order_by(desc(Candidate.overall_score)).limit(30)
            res = await session.execute(stmt)
            candidates = list(res.scalars().all())

        total_cands = len(candidates)
        if total_cands == 0:
            return {
                "status": "completed",
                "total_verified": 0,
                "duration_seconds": 0.0,
                "results": [],
            }

        await self.jobs.update_job(
            job_id,
            step_index=2,
            step_name=f"Running OpenAI Verification ({model})",
            message=f"Verifying {total_cands} candidates with OpenAI Vision engine...",
            progress=30.0,
        )

        verified_records: List[Dict[str, Any]] = []

        for idx, cand in enumerate(candidates):
            primary_view = next((v for v in cand.views if v.id == cand.primary_view_id), None)
            if not primary_view and cand.views:
                primary_view = cand.views[0]

            if not primary_view or not primary_view.file_hash:
                continue

            img_path = await self.cache.get_image_path(primary_view.file_hash)
            if not img_path or not img_path.exists():
                continue

            # Run OpenAI verification
            attr = await analyzer.analyze_wall(
                image_path=img_path,
                context={
                    "candidate_id": cand.id,
                    "latitude": cand.latitude,
                    "longitude": cand.longitude,
                    "view_heading": primary_view.view_heading,
                },
            )

            openai_score = round(attr.wall_quality * 100.0, 1)
            vlm_baseline = cand.wall_score or 70.0
            consensus_delta = round(abs(vlm_baseline - openai_score), 1)

            verified_records.append(
                {
                    "candidate_id": cand.id,
                    "verified_by_openai": True,
                    "openai_verification_json": {
                        "model": model,
                        "verified_score": openai_score,
                        "vlm_baseline_score": vlm_baseline,
                        "consensus_delta": consensus_delta,
                        "confidence": attr.confidence,
                        "wall_material": attr.wall_material,
                        "size_class": attr.size_class,
                        "obstruction_details": attr.obstruction_details,
                        "reason": attr.reason,
                    },
                    "notes": (
                        f"[OpenAI Verified: {attr.confidence * 100:.0f}% confidence] "
                        f"{attr.reason}"
                    ),
                }
            )

            pct = 30.0 + ((idx + 1) / total_cands) * 55.0
            await self.jobs.update_job(
                job_id,
                progress=pct,
                message=f"Verified {idx + 1} of {total_cands} candidates with OpenAI Vision...",
            )
            await asyncio.sleep(0)

        # Step 3: Persist verification to SQLite
        await self.jobs.update_job(
            job_id,
            step_index=3,
            step_name="Persisting OpenAI Verification Badges",
            message=f"Saving verification badges and consensus records for {len(verified_records)} candidates in SQLite...",
            progress=90.0,
        )

        async with async_session_factory() as session:
            for item in verified_records:
                stmt_c = select(Candidate).where(Candidate.id == item["candidate_id"])
                cand_db = (await session.execute(stmt_c)).scalar_one_or_none()
                if cand_db:
                    cand_db.verified_by_openai = True
                    cand_db.openai_verification_json = item["openai_verification_json"]
                    cand_db.notes = item["notes"]
            await session.commit()

        duration = round(time.time() - start_time, 2)
        summary = {
            "status": "success",
            "total_verified": len(verified_records),
            "model_used": model,
            "avg_consensus_delta": (
                round(
                    sum(
                        r["openai_verification_json"]["consensus_delta"]
                        for r in verified_records
                    )
                    / max(1, len(verified_records)),
                    1,
                )
                if verified_records
                else 0.0
            ),
            "duration_seconds": duration,
        }

        return summary


openai_verification_service = OpenAIVerificationService()
