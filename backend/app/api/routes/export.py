from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db
from backend.app.schemas.candidate import CandidateDTO
from backend.app.schemas.common import APIResponse
from backend.app.schemas.export import ExecutiveDossierResponse, SearchFilterParams
from backend.app.services.export import export_service

router = APIRouter(prefix="/export", tags=["Search, Filter & Export"])


@router.get("/search", response_model=APIResponse[List[CandidateDTO]])
async def search_candidates(
    min_score: float = Query(default=0.0, ge=0.0, le=100.0),
    max_score: float = Query(default=100.0, ge=0.0, le=100.0),
    grade: Optional[str] = Query(default=None),
    wall_material: Optional[str] = Query(default=None),
    size_class: Optional[str] = Query(default=None),
    min_blankness: float = Query(default=0.0, ge=0.0, le=100.0),
    min_visibility: float = Query(default=0.0, ge=0.0, le=100.0),
    verified_only: bool = Query(default=False),
    query_text: Optional[str] = Query(default=None),
    excluded_materials: Optional[List[str]] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Search and filter mural wall candidate targets across multi-criteria parameters.
    """
    candidates = await export_service.search_candidates(
        db=db,
        min_score=min_score,
        max_score=max_score,
        grade=grade,
        wall_material=wall_material,
        size_class=size_class,
        min_blankness=min_blankness,
        min_visibility=min_visibility,
        verified_only=verified_only,
        query_text=query_text,
        excluded_materials=excluded_materials,
    )

    dtos = [
        CandidateDTO(
            id=c.id,
            search_area_id=c.search_area_id,
            latitude=c.latitude,
            longitude=c.longitude,
            address=c.address,
            best_image_id=c.best_image_id,
            primary_view_id=c.primary_view_id,
            view_count=c.view_count or len(c.views) or 1,
            overall_score=c.overall_score or 75.0,
            wall_score=c.wall_score,
            blankness_score=c.blankness_score,
            visibility_score=c.visibility_score,
            access_score=c.access_score,
            confidence_score=c.confidence_score,
            estimated_size=c.estimated_size,
            wall_material=c.wall_material,
            existing_artwork=c.existing_artwork,
            primary_view_preview_url=(
                f"/api/cache/images/{c.views[0].file_hash}" if c.views else None
            ),
            primary_view_heading=c.views[0].view_heading if c.views else None,
            primary_view_clip_score=c.views[0].raw_clip_score if c.views else 0.0,
            created_at=c.created_at,
        )
        for c in candidates
    ]

    return APIResponse(data=dtos, message=f"Found {len(dtos)} matching mural wall targets")


@router.get("/csv")
async def export_csv(
    min_score: float = Query(default=0.0, ge=0.0, le=100.0),
    max_score: float = Query(default=100.0, ge=0.0, le=100.0),
    grade: Optional[str] = Query(default=None),
    wall_material: Optional[str] = Query(default=None),
    size_class: Optional[str] = Query(default=None),
    min_blankness: float = Query(default=0.0, ge=0.0, le=100.0),
    min_visibility: float = Query(default=0.0, ge=0.0, le=100.0),
    verified_only: bool = Query(default=False),
    query_text: Optional[str] = Query(default=None),
    excluded_materials: Optional[List[str]] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Download filtered mural wall candidates as a CSV spreadsheet.
    """
    candidates = await export_service.search_candidates(
        db=db,
        min_score=min_score,
        max_score=max_score,
        grade=grade,
        wall_material=wall_material,
        size_class=size_class,
        min_blankness=min_blankness,
        min_visibility=min_visibility,
        verified_only=verified_only,
        query_text=query_text,
        excluded_materials=excluded_materials,
    )

    csv_data = export_service.generate_csv(candidates)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=mural_walls.csv"},
    )


@router.get("/geojson")
async def export_geojson(
    min_score: float = Query(default=0.0, ge=0.0, le=100.0),
    max_score: float = Query(default=100.0, ge=0.0, le=100.0),
    grade: Optional[str] = Query(default=None),
    wall_material: Optional[str] = Query(default=None),
    size_class: Optional[str] = Query(default=None),
    min_blankness: float = Query(default=0.0, ge=0.0, le=100.0),
    min_visibility: float = Query(default=0.0, ge=0.0, le=100.0),
    verified_only: bool = Query(default=False),
    query_text: Optional[str] = Query(default=None),
    excluded_materials: Optional[List[str]] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Download filtered mural wall candidates as an RFC 7946 GeoJSON FeatureCollection.
    """
    candidates = await export_service.search_candidates(
        db=db,
        min_score=min_score,
        max_score=max_score,
        grade=grade,
        wall_material=wall_material,
        size_class=size_class,
        min_blankness=min_blankness,
        min_visibility=min_visibility,
        verified_only=verified_only,
        query_text=query_text,
        excluded_materials=excluded_materials,
    )

    geojson_data = export_service.generate_geojson(candidates)
    import json
    return Response(
        content=json.dumps(geojson_data, indent=2),
        media_type="application/geo+json",
        headers={"Content-Disposition": "attachment; filename=mural_walls.geojson"},
    )


@router.get("/dossier", response_model=APIResponse[ExecutiveDossierResponse])
async def export_executive_dossier(
    min_score: float = Query(default=0.0, ge=0.0, le=100.0),
    db: AsyncSession = Depends(get_db),
):
    """
    Download executive scouting briefing dossier summary.
    """
    candidates = await export_service.search_candidates(db=db, min_score=min_score)
    dossier = export_service.generate_executive_dossier(candidates)
    return APIResponse(
        data=ExecutiveDossierResponse(**dossier),
        message="Executive scouting dossier generated successfully",
    )
