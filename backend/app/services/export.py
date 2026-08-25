import csv
import io
import json
from typing import Any, Dict, List, Optional
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.candidate import Candidate, CandidateView


class ExportService:
    """
    Service generating tabular CSV exports, RFC 7946 GeoJSON FeatureCollections,
    and Executive Scouting Dossiers for prospective mural walls.
    """

    async def search_candidates(
        self,
        db: AsyncSession,
        min_score: float = 0.0,
        max_score: float = 100.0,
        grade: Optional[str] = None,
        wall_material: Optional[str] = None,
        size_class: Optional[str] = None,
        min_blankness: float = 0.0,
        min_visibility: float = 0.0,
        verified_only: bool = False,
        query_text: Optional[str] = None,
        excluded_materials: Optional[List[str]] = None,
    ) -> List[Candidate]:
        """
        Multi-parameter search and filtering across candidate walls.
        """
        stmt = (
            select(Candidate)
            .options(selectinload(Candidate.views))
            .order_by(desc(Candidate.overall_score), desc(Candidate.id))
        )

        res = await db.execute(stmt)
        all_cands = res.scalars().all()

        filtered: List[Candidate] = []
        for c in all_cands:
            score = c.overall_score or 75.0
            if score < min_score or score > max_score:
                continue

            if (c.blankness_score or 0.0) < min_blankness:
                continue

            if (c.visibility_score or 0.0) < min_visibility:
                continue

            if verified_only and not c.verified_by_openai:
                continue

            if excluded_materials:
                excl = [m.lower().strip() for m in excluded_materials if m]
                cand_mat = (c.wall_material or "").lower()
                if any(ex in cand_mat for ex in excl):
                    continue

            if wall_material and wall_material.upper() != "ALL":
                if (c.wall_material or "").lower() != wall_material.lower():
                    continue

            if size_class and size_class.upper() != "ALL":
                if (c.estimated_size or "").lower() != size_class.lower():
                    continue

            if grade and grade.upper() != "ALL":
                c_grade = "A" if score >= 90 else "B" if score >= 80 else "C" if score >= 70 else "D"
                if c_grade != grade.upper():
                    continue

            if query_text:
                q = query_text.lower()
                match = (
                    q in str(c.id)
                    or (c.address and q in c.address.lower())
                    or (c.wall_material and q in c.wall_material.lower())
                    or (c.notes and q in c.notes.lower())
                )
                if not match:
                    continue

            filtered.append(c)

        return filtered

    def generate_csv(self, candidates: List[Candidate]) -> str:
        """
        Generates RFC 4180 compliant CSV string from candidate walls.
        """
        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

        # Header Row
        writer.writerow([
            "candidate_id",
            "latitude",
            "longitude",
            "address",
            "composite_score",
            "grade",
            "wall_quality_score",
            "blankness_score",
            "visibility_score",
            "access_score",
            "confidence_score",
            "wall_material",
            "canvas_size",
            "view_count",
            "verified_by_openai",
            "primary_view_heading",
            "primary_clip_score",
            "preview_url",
            "notes",
            "created_at",
        ])

        for c in candidates:
            score = c.overall_score or 75.0
            grade = "A+" if score >= 95 else "A" if score >= 90 else "B" if score >= 80 else "C" if score >= 70 else "D"

            primary_view = next((v for v in c.views if v.id == c.primary_view_id), None)
            if not primary_view and c.views:
                primary_view = c.views[0]

            preview_url = (
                f"/api/cache/images/{primary_view.file_hash}" if primary_view else ""
            )
            heading = primary_view.view_heading if primary_view else ""
            clip_score = primary_view.raw_clip_score if primary_view else ""

            writer.writerow([
                c.id,
                f"{c.latitude:.6f}",
                f"{c.longitude:.6f}",
                c.address or f"Wall Location ({c.latitude:.5f}, {c.longitude:.5f})",
                f"{score:.1f}",
                grade,
                f"{c.wall_score:.1f}" if c.wall_score is not None else "",
                f"{c.blankness_score:.1f}" if c.blankness_score is not None else "",
                f"{c.visibility_score:.1f}" if c.visibility_score is not None else "",
                f"{c.access_score:.1f}" if c.access_score is not None else "",
                f"{c.confidence_score:.1f}" if c.confidence_score is not None else "",
                c.wall_material or "masonry",
                c.estimated_size or "large",
                c.view_count or len(c.views) or 1,
                "YES" if c.verified_by_openai else "NO",
                heading,
                f"{clip_score:.4f}" if clip_score != "" else "",
                preview_url,
                (c.notes or "").replace("\n", " "),
                c.created_at.isoformat() if c.created_at else "",
            ])

        return output.getvalue()

    def generate_geojson(self, candidates: List[Candidate]) -> Dict[str, Any]:
        """
        Generates RFC 7946 GeoJSON FeatureCollection with Point geometries.
        """
        features: List[Dict[str, Any]] = []

        for c in candidates:
            score = c.overall_score or 75.0
            grade = "A+" if score >= 95 else "A" if score >= 90 else "B" if score >= 80 else "C" if score >= 70 else "D"

            primary_view = next((v for v in c.views if v.id == c.primary_view_id), None)
            if not primary_view and c.views:
                primary_view = c.views[0]

            preview_url = (
                f"/api/cache/images/{primary_view.file_hash}" if primary_view else None
            )

            feature = {
                "type": "Feature",
                "id": c.id,
                "geometry": {
                    "type": "Point",
                    "coordinates": [c.longitude, c.latitude],
                },
                "properties": {
                    "candidate_id": c.id,
                    "address": c.address or f"Wall Location ({c.latitude:.5f}, {c.longitude:.5f})",
                    "overall_score": score,
                    "grade": grade,
                    "wall_score": c.wall_score,
                    "blankness_score": c.blankness_score,
                    "visibility_score": c.visibility_score,
                    "access_score": c.access_score,
                    "confidence_score": c.confidence_score,
                    "wall_material": c.wall_material or "masonry",
                    "estimated_size": c.estimated_size or "large",
                    "existing_artwork": c.existing_artwork,
                    "verified_by_openai": c.verified_by_openai,
                    "view_count": c.view_count or len(c.views) or 1,
                    "primary_heading": primary_view.view_heading if primary_view else None,
                    "preview_url": preview_url,
                    "notes": c.notes,
                },
            }
            features.append(feature)

        return {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "generator": "Mural Search v0.1.0",
                "total_features": len(features),
                "scoring_formula": "M = 0.30W + 0.25B + 0.20V + 0.15A + 0.10C",
            },
        }

    def generate_executive_dossier(self, candidates: List[Candidate]) -> Dict[str, Any]:
        """
        Generates structured executive scouting dossier summary for mural curators and art commissions.
        """
        total = len(candidates)
        avg_score = (
            round(sum((c.overall_score or 75.0) for c in candidates) / max(1, total), 1)
            if total > 0
            else 0.0
        )

        grade_dist = {"A": 0, "B": 0, "C": 0, "D": 0}
        material_dist: Dict[str, int] = {}

        for c in candidates:
            s = c.overall_score or 75.0
            g = "A" if s >= 90 else "B" if s >= 80 else "C" if s >= 70 else "D"
            grade_dist[g] = grade_dist.get(g, 0) + 1

            mat = (c.wall_material or "masonry").lower()
            material_dist[mat] = material_dist.get(mat, 0) + 1

        # Top 10 Recommended Walls
        top_cands = sorted(candidates, key=lambda c: (c.overall_score or 0.0), reverse=True)[:10]
        recommendations = []

        for rank, c in enumerate(top_cands, start=1):
            primary_view = next((v for v in c.views if v.id == c.primary_view_id), None)
            if not primary_view and c.views:
                primary_view = c.views[0]

            recommendations.append({
                "rank": rank,
                "candidate_id": c.id,
                "coordinates": {"latitude": c.latitude, "longitude": c.longitude},
                "overall_score": c.overall_score,
                "grade": "A+" if (c.overall_score or 0) >= 95 else "A" if (c.overall_score or 0) >= 90 else "B",
                "material": c.wall_material or "masonry",
                "canvas_size": c.estimated_size or "large",
                "view_count": c.view_count or len(c.views) or 1,
                "verified_by_openai": c.verified_by_openai,
                "preview_url": f"/api/cache/images/{primary_view.file_hash}" if primary_view else None,
                "curator_notes": c.notes,
            })

        return {
            "title": "Mural Search - Executive Wall Prospecting Briefing",
            "version": "0.1.0",
            "summary_metrics": {
                "total_walls_scouted": total,
                "average_composite_score": avg_score,
                "grade_distribution": grade_dist,
                "material_distribution": material_dist,
                "verified_by_openai_count": sum(1 for c in candidates if c.verified_by_openai),
            },
            "top_recommended_walls": recommendations,
            "methodology": {
                "formula": "M = 0.30W + 0.25B + 0.20V + 0.15A + 0.10C - Obstructions - Artwork",
                "clustering_radius_meters": 15.0,
                "vision_models": ["OpenCLIP ViT-B-32", "Local VLM", "OpenAI GPT-4o-mini"],
            },
        }


export_service = ExportService()
