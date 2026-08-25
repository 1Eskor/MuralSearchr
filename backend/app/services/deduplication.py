import asyncio
import math
import time
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.config import Settings, get_settings
from backend.app.core.database import async_session_factory
from backend.app.core.logging import logger
from backend.app.models.candidate import Candidate, CandidateView
from backend.app.services.job_runner import JobManager, job_manager
from backend.app.services.reduction import haversine_distance_meters


class DeduplicationService:
    """
    Service managing multi-view spatial clustering, duplicate candidate resolution,
    and canonical physical wall promotion.
    """

    def __init__(
        self,
        job_mgr: Optional[JobManager] = None,
        settings: Optional[Settings] = None,
    ):
        self.jobs = job_mgr or job_manager
        self.settings = settings or get_settings()

    async def deduplicate_candidates_batch(
        self,
        job_id: str,
        spatial_radius_meters: float = 15.0,
        visual_sim_threshold: float = 0.90,
    ) -> Dict[str, Any]:
        """
        Merges redundant candidate views capturing the same physical wall from different distances/angles
        into unified canonical physical wall entities.
        """
        start_time = time.time()

        await self.jobs.update_job(
            job_id,
            status="running",
            step_index=1,
            step_name="Loading Wall Candidates from Database",
            message="Querying candidate entities and directional views from SQLite...",
            progress=15.0,
        )

        async with async_session_factory() as session:
            stmt = select(Candidate).options(selectinload(Candidate.views)).order_by(desc(Candidate.overall_score))
            res = await session.execute(stmt)
            candidates = list(res.scalars().all())

        initial_count = len(candidates)
        if initial_count == 0:
            return {
                "status": "completed",
                "initial_candidates": 0,
                "unique_walls": 0,
                "duplicates_merged": 0,
                "reduction_rate_pct": 0.0,
                "duration_seconds": 0.0,
            }

        # Step 2: Spatial Clustering
        await self.jobs.update_job(
            job_id,
            step_index=2,
            step_name="Grouping Spatial Multi-Angle Clusters",
            message=f"Clustering {initial_count} candidates within {spatial_radius_meters}m radius...",
            progress=45.0,
        )

        clusters: List[List[Candidate]] = []
        for cand in candidates:
            matched_cluster = None
            for cl in clusters:
                ref_cand = cl[0]
                dist = haversine_distance_meters(
                    cand.latitude, cand.longitude, ref_cand.latitude, ref_cand.longitude
                )
                if dist <= spatial_radius_meters:
                    matched_cluster = cl
                    break

            if matched_cluster is not None:
                matched_cluster.append(cand)
            else:
                clusters.append([cand])

        # Step 3: Canonical Entity Promotion and Child View Consolidation
        await self.jobs.update_job(
            job_id,
            step_index=3,
            step_name="Consolidating Canonical Walls & Multi-View Angles",
            message=f"Promoting {len(clusters)} canonical walls and consolidating child views...",
            progress=75.0,
        )

        duplicates_merged = 0
        canonical_walls_count = len(clusters)

        async with async_session_factory() as session:
            for cl in clusters:
                # Canonical candidate has highest overall score
                cl_sorted = sorted(cl, key=lambda c: (c.overall_score or 0.0), reverse=True)
                canonical_cand = cl_sorted[0]
                duplicate_cands = cl_sorted[1:]

                # Get all candidate IDs in this cluster
                cluster_cand_ids = [c.id for c in cl]

                # Fetch all views belonging to all candidates in this cluster
                stmt_views = select(CandidateView).where(CandidateView.candidate_id.in_(cluster_cand_ids))
                all_views = list((await session.execute(stmt_views)).scalars().all())

                # Sort views by clip score / quality
                views_sorted = sorted(all_views, key=lambda v: (v.raw_clip_score or 0.0), reverse=True)

                # Reassign all views to canonical candidate
                for idx, v in enumerate(views_sorted):
                    v.candidate_id = canonical_cand.id
                    v.is_primary = (idx == 0)

                # Update canonical candidate attributes
                avg_lat = sum(c.latitude for c in cl) / len(cl)
                avg_lon = sum(c.longitude for c in cl) / len(cl)

                stmt_cand_db = select(Candidate).where(Candidate.id == canonical_cand.id)
                cand_db = (await session.execute(stmt_cand_db)).scalar_one_or_none()
                if cand_db:
                    cand_db.latitude = avg_lat
                    cand_db.longitude = avg_lon
                    cand_db.view_count = len(all_views)
                    if views_sorted:
                        cand_db.primary_view_id = views_sorted[0].id

                # Delete duplicate candidate records
                for dup in duplicate_cands:
                    stmt_dup = select(Candidate).where(Candidate.id == dup.id)
                    dup_db = (await session.execute(stmt_dup)).scalar_one_or_none()
                    if dup_db:
                        await session.delete(dup_db)
                        duplicates_merged += 1

            await session.commit()

        duration = round(time.time() - start_time, 2)
        reduction_rate = (
            round((duplicates_merged / max(1, initial_count)) * 100.0, 1)
            if initial_count > 0
            else 0.0
        )

        # Count multi-perspective ratio
        async with async_session_factory() as session:
            stmt_all = select(Candidate)
            remaining_cands = list((await session.execute(stmt_all)).scalars().all())
            multi_view_count = sum(1 for c in remaining_cands if c.view_count > 1)
            multi_view_pct = (
                round((multi_view_count / max(1, len(remaining_cands))) * 100.0, 1)
                if remaining_cands
                else 0.0
            )

        summary = {
            "status": "success",
            "initial_candidates": initial_count,
            "unique_canonical_walls": len(remaining_cands),
            "duplicates_merged": duplicates_merged,
            "reduction_rate_pct": reduction_rate,
            "multi_view_walls_count": multi_view_count,
            "multi_view_pct": multi_view_pct,
            "duration_seconds": duration,
        }

        return summary


deduplication_service = DeduplicationService()
