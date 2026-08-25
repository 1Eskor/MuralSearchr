import pytest
from httpx import ASGITransport, AsyncClient
from backend.app.main import app
from backend.app.providers.geodata.osm import OSMOverpassProvider


SAMPLE_POLYGON = {
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


@pytest.mark.asyncio
async def test_osm_provider_info_and_bbox():
    provider = OSMOverpassProvider()
    info = provider.get_info()
    assert info.provider_type == "geodata"
    assert "osm" in info.name

    min_lat, min_lon, max_lat, max_lon = provider._extract_bbox(SAMPLE_POLYGON)
    assert min_lat == 40.7110
    assert max_lat == 40.7150
    assert min_lon == -74.0080
    assert max_lon == -74.0040

    poly_str = provider._format_poly_filter(SAMPLE_POLYGON)
    assert "40.711000 -74.008000" in poly_str


@pytest.mark.asyncio
async def test_osm_provider_sample_points():
    provider = OSMOverpassProvider(timeout_seconds=0.5)
    points = await provider.generate_sample_points(
        SAMPLE_POLYGON,
        step_distance_meters=20.0,
        max_building_distance_meters=35.0,
    )
    assert len(points) > 0
    first_pt = points[0]
    assert first_pt.latitude > 0
    assert first_pt.longitude < 0
    assert first_pt.heading_along_road is not None
    assert 0.0 <= first_pt.heading_along_road <= 360.0


@pytest.mark.asyncio
async def test_geodata_extract_api():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        req_payload = {
            "polygon_geojson": SAMPLE_POLYGON,
            "step_distance_meters": 25.0,
            "max_building_distance_meters": 40.0,
            "provider": "mock",
        }
        res = await client.post("/api/geodata/extract", json=req_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        result = data["data"]
        assert result["total_roads"] > 0
        assert result["total_buildings"] > 0
        assert result["total_sample_points"] > 0
        assert "roads_geojson" in result
        assert "buildings_geojson" in result


@pytest.mark.asyncio
async def test_search_areas_crud_api():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_payload = {
            "name": "Wynwood Test District",
            "polygon_geojson": SAMPLE_POLYGON,
            "total_roads": 15,
            "total_buildings": 42,
            "sample_points_count": 180,
        }
        create_res = await client.post("/api/search-areas", json=create_payload)
        assert create_res.status_code == 200
        created = create_res.json()["data"]
        area_id = created["id"]
        assert area_id > 0
        assert created["name"] == "Wynwood Test District"

        # List
        list_res = await client.get("/api/search-areas")
        assert list_res.status_code == 200
        areas = list_res.json()["data"]
        assert len(areas) >= 1

        # Get
        get_res = await client.get(f"/api/search-areas/{area_id}")
        assert get_res.status_code == 200
        assert get_res.json()["data"]["id"] == area_id

        # Delete
        del_res = await client.delete(f"/api/search-areas/{area_id}")
        assert del_res.status_code == 200
