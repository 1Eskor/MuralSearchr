from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import get_db
from backend.app.models.search_area import SearchArea
from backend.app.schemas.common import APIResponse
from backend.app.schemas.search_area import SearchAreaCreate, SearchAreaResponse

router = APIRouter(prefix="/search-areas", tags=["Search Areas"])


@router.post("", response_model=APIResponse[SearchAreaResponse])
async def create_search_area(req: SearchAreaCreate, db: AsyncSession = Depends(get_db)):
    area = SearchArea(
        name=req.name,
        polygon_geojson=req.polygon_geojson,
        total_roads=req.total_roads,
        total_buildings=req.total_buildings,
        sample_points_count=req.sample_points_count,
        status="ready",
    )
    db.add(area)
    await db.commit()
    await db.refresh(area)

    return APIResponse(data=area, message=f"Search area '{area.name}' saved with ID {area.id}")


@router.get("", response_model=APIResponse[List[SearchAreaResponse]])
async def list_search_areas(db: AsyncSession = Depends(get_db)):
    stmt = select(SearchArea).order_by(desc(SearchArea.created_at)).limit(50)
    res = await db.execute(stmt)
    areas = res.scalars().all()
    return APIResponse(data=list(areas), message=f"Retrieved {len(areas)} search areas")


@router.get("/{area_id}", response_model=APIResponse[SearchAreaResponse])
async def get_search_area(area_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(SearchArea).where(SearchArea.id == area_id)
    res = await db.execute(stmt)
    area = res.scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail=f"Search area {area_id} not found")
    return APIResponse(data=area, message="Search area found")


@router.delete("/{area_id}", response_model=APIResponse[dict])
async def delete_search_area(area_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(SearchArea).where(SearchArea.id == area_id)
    res = await db.execute(stmt)
    area = res.scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail=f"Search area {area_id} not found")
    await db.delete(area)
    await db.commit()
    return APIResponse(data={"deleted_id": area_id}, message=f"Search area {area_id} deleted")
