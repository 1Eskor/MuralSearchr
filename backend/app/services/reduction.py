import asyncio
import math
import time
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import Settings, get_settings
from backend.app.core.database import async_session_factory
from backend.app.core.logging import logger
from backend.app.models.candidate import Candidate, CandidateView
from backend.app.models.imagery import Imagery
from backend.app.schemas.candidate import CandidateDTO
from backend.app.services.cache import ImageCacheManager, cache_manager
from backend.app.services.job_runner import JobManager, job_manager


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on the earth in meters.
    """
    r = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


class CandidateReductionService:
    """
    Service managing candidate reduction, score thresholding,
    spatial view clustering, and candidate promotion to the database.
    """

    def __init__(
        self,
        job_mgr: Optional[JobManager] = None,
        image_cache: Optional[ImageCacheManager] = None,
        settings: Optional[Settings] = None,
    ):
        self.jobs = job_mgr or job_manager
        self.cache = image_cache or cache_manager
        self.settings = settings or get_settings()

    async def reduce_and_promote_candidates(
        self,
        job_id: str,
        min_score: float = 0.50,
        top_percentile: float = 0.20,
        cluster_distance_meters: float = 15.0,
        max_candidates: int = 50,
        excluded_materials: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Filters top candidate views, clusters nearby perspectives into unified
        physical wall Candidates, and saves them in the database.
        """
        start_time = time.time()

        await self.jobs.update_job(
            job_id,
            status="running",
            step_index=1,
            step_name="Querying Scored Perspective Views",
            message="Loading ranked candidate perspective views from SQLite...",
            progress=15.0,
        )

        async with async_session_factory() as session:
            # Query all views with joined imagery coordinates
            stmt = (
                select(CandidateView, Imagery)
                .join(Imagery, CandidateView.imagery_id == Imagery.id)
                .order_by(desc(CandidateView.raw_clip_score))
            )
            res = await session.execute(stmt)
            view_imagery_pairs = res.all()

        total_input_views = len(view_imagery_pairs)
        if total_input_views == 0:
            return {
                "status": "completed",
                "total_input_views": 0,
                "qualifying_views": 0,
                "promoted_candidates_count": 0,
                "reduction_rate_pct": 0.0,
                "duration_seconds": 0.0,
                "candidates": [],
            }

        # Step 2: Score Filtering and Percentile Cutoff
        await self.jobs.update_job(
            job_id,
            step_index=2,
            step_name="Filtering Top-K Percentile Views",
            message=f"Applying {min_score * 100:.0f}% minimum CLIP threshold and top {top_percentile * 100:.0f}% cutoff...",
            progress=35.0,
        )

        # Filter by minimum score
        passing_pairs = [
            (v, img)
            for v, img in view_imagery_pairs
            if (v.raw_clip_score or 0.0) >= min_score and v.wall_detected
        ]

        # If strict threshold yields too few, take top views
        if not passing_pairs:
            passing_pairs = view_imagery_pairs[: max(10, int(total_input_views * top_percentile))]

        # Top percentile / max limit cutoff
        cutoff_count = min(max_candidates * 3, max(5, int(len(passing_pairs) * top_percentile * 2.5)))
        qualifying_pairs = passing_pairs[:cutoff_count]
        qualifying_views_count = len(qualifying_pairs)

        # Step 3: Spatial Clustering into Physical Wall Candidates
        await self.jobs.update_job(
            job_id,
            step_index=3,
            step_name="Clustering Spatial Perspective Views",
            message=f"Clustering {qualifying_views_count} views within {cluster_distance_meters}m radius into wall entities...",
            progress=60.0,
        )

        clusters: List[List[Tuple[CandidateView, Imagery]]] = []
        for v, img in qualifying_pairs:
            matched_cluster = None
            for cl in clusters:
                # Compare against centroid/first item of cluster
                _, ref_img = cl[0]
                dist = haversine_distance_meters(
                    img.latitude, img.longitude, ref_img.latitude, ref_img.longitude
                )
                if dist <= cluster_distance_meters:
                    matched_cluster = cl
                    break

            if matched_cluster is not None:
                matched_cluster.append((v, img))
            else:
                clusters.append([(v, img)])

            if len(clusters) >= max_candidates:
                break

        # Step 4: Promote Candidates and Save to Database
        await self.jobs.update_job(
            job_id,
            step_index=4,
            step_name="Promoting Candidates to Database",
            message=f"Saving {len(clusters)} unique wall Candidates into SQLite...",
            progress=85.0,
        )

        promoted_dtos: List[CandidateDTO] = []
        async with async_session_factory() as session:
            for cl in clusters:
                # Find the view with the highest raw_clip_score
                cl_sorted = sorted(cl, key=lambda x: (x[0].raw_clip_score or 0.0), reverse=True)
                primary_view_row, primary_img = cl_sorted[0]

                # Classify material and size from primary view image
                material = "brick"
                size_class = "large" if len(cl) >= 3 else "medium"
                view_img_path = None
                if primary_view_row.local_path and Path(primary_view_row.local_path).exists():
                    view_img_path = Path(primary_view_row.local_path)
                elif primary_view_row.file_hash:
                    vp = await self.cache.get_image_path(primary_view_row.file_hash)
                    if vp and vp.exists():
                        view_img_path = vp

                if view_img_path and view_img_path.exists():
                    try:
                        from PIL import Image
                        from backend.app.providers.registry import registry
                        ranker = registry._vision_rankers.get("openclip") or registry._vision_rankers.get("siglip2")
                        if ranker and hasattr(ranker, "classify_material_and_size"):
                            with Image.open(view_img_path) as pimg:
                                mat, conf, s_cls = ranker.classify_material_and_size(pimg)
                                material = mat
                                if s_cls:
                                    size_class = s_cls
                    except Exception:
                        pass

                # Check hard material exclusion
                if excluded_materials:
                    excl = [m.lower().strip() for m in excluded_materials if m]
                    if any(ex in material.lower() for ex in excl):
                        continue

                # Compute cluster center
                avg_lat = sum(img.latitude for _, img in cl) / len(cl)
                avg_lon = sum(img.longitude for _, img in cl) / len(cl)
                top_score = primary_view_row.raw_clip_score or 0.75
                overall_100 = round(top_score * 100.0, 1)

                candidate_obj = Candidate(
                    search_area_id=getattr(primary_img, "search_area_id", None),
                    latitude=avg_lat,
                    longitude=avg_lon,
                    address=f"Wall Location ({avg_lat:.5f}, {avg_lon:.5f})",
                    best_image_id=primary_img.id,
                    primary_view_id=primary_view_row.id,
                    view_count=len(cl),
                    overall_score=overall_100,
                    wall_score=overall_100,
                    blankness_score=round(top_score * 95.0, 1),
                    visibility_score=85.0,
                    access_score=90.0,
                    confidence_score=round(top_score * 90.0, 1),
                    estimated_size=size_class,
                    wall_material=material,
                    existing_artwork=False,
                    verified_by_openai=False,
                )
                session.add(candidate_obj)
                await session.flush()  # Generate candidate_obj.id

                # Update views to link candidate_id and set is_primary
                for idx, (v_item, _) in enumerate(cl_sorted):
                    stmt_v = select(CandidateView).where(CandidateView.id == v_item.id)
                    v_db = (await session.execute(stmt_v)).scalar_one_or_none()
                    if v_db:
                        v_db.candidate_id = candidate_obj.id
                        v_db.is_primary = (idx == 0)

                promoted_dtos.append(
                    CandidateDTO(
                        id=candidate_obj.id,
                        search_area_id=candidate_obj.search_area_id,
                        latitude=candidate_obj.latitude,
                        longitude=candidate_obj.longitude,
                        address=candidate_obj.address,
                        best_image_id=candidate_obj.best_image_id,
                        primary_view_id=candidate_obj.primary_view_id,
                        view_count=candidate_obj.view_count,
                        overall_score=candidate_obj.overall_score,
                        wall_score=candidate_obj.wall_score,
                        blankness_score=candidate_obj.blankness_score,
                        visibility_score=candidate_obj.visibility_score,
                        access_score=candidate_obj.access_score,
                        confidence_score=candidate_obj.confidence_score,
                        estimated_size=candidate_obj.estimated_size,
                        wall_material=candidate_obj.wall_material,
                        existing_artwork=candidate_obj.existing_artwork,
                        primary_view_preview_url=f"/api/cache/images/{primary_view_row.file_hash}",
                        primary_view_heading=primary_view_row.view_heading,
                        primary_view_clip_score=primary_view_row.raw_clip_score,
                        created_at=candidate_obj.created_at,
                    )
                )

            await session.commit()

        duration = round(time.time() - start_time, 2)
        reduction_rate = round(
            (1.0 - (len(promoted_dtos) / max(1, total_input_views))) * 100.0, 1
        )
        calls_saved = max(0, total_input_views - len(promoted_dtos))
        dollars_saved = round(calls_saved * 0.005, 3)

        summary = {
            "status": "success",
            "total_input_views": total_input_views,
            "qualifying_views": qualifying_views_count,
            "promoted_candidates_count": len(promoted_dtos),
            "reduction_rate_pct": reduction_rate,
            "vlm_calls_saved": calls_saved,
            "estimated_dollars_saved": dollars_saved,
            "duration_seconds": duration,
        }

        return summary


candidate_reduction_service = CandidateReductionService()
