import pytest
from httpx import ASGITransport, AsyncClient
from backend.app.main import app
from backend.app.providers.geodata.base import SamplePoint
from backend.app.providers.imagery.mapillary import MapillaryProvider
from backend.app.services.ingestion import ImageryIngestionService
from backend.app.services.job_runner import JobManager


@pytest.mark.asyncio
async def test_mapillary_provider_fallback(tmp_path):
    provider = MapillaryProvider()
    info = provider.get_info()
    assert info.provider_type == "imagery"
    assert info.name == "mapillary"

    # Query without token should produce fallback metadata
    metas = await provider.query_images_near_coordinates(25.8015, -80.1993, max_images=3)
    assert len(metas) > 0
    assert metas[0].latitude > 0
    assert metas[0].heading is not None

    # Download image to disk
    dest = tmp_path / "test_wall_img.jpg"
    saved = await provider.download_image(metas[0], dest)
    assert saved.exists()
    assert saved.stat().st_size > 1000


@pytest.mark.asyncio
async def test_imagery_ingestion_service():
    service = ImageryIngestionService()
    sample_pts = [
        SamplePoint(id="pt_1", latitude=25.801, longitude=-80.199, heading_along_road=90.0, road_name="NW 2nd Ave"),
        SamplePoint(id="pt_2", latitude=25.802, longitude=-80.198, heading_along_road=180.0, road_name="NW 24th St"),
    ]

    job_id = service.jobs.create_job(job_type="test_ingestion", total_steps=3)
    result = await service.ingest_for_points(
        job_id=job_id,
        sample_points=sample_pts,
        max_images_per_point=2,
    )

    assert result["status"] == "success"
    assert result["total_points_queried"] == 2
    assert result["total_images_ingested"] >= 2
    assert len(result["images"]) >= 2
    first_img = result["images"][0]
    assert "file_hash" in first_img
    assert "preview_url" in first_img


@pytest.mark.asyncio
async def test_imagery_api_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Ingest trigger
        ingest_payload = {
            "polygon_geojson": {
                "type": "Polygon",
                "coordinates": [[[-80.202, 25.798], [-80.196, 25.798], [-80.196, 25.804], [-80.202, 25.804], [-80.202, 25.798]]]
            },
            "max_images_per_point": 2,
        }
        res = await client.post("/api/imagery/ingest", json=ingest_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        job_id = data["data"]["job_id"]
        assert job_id.startswith("job_")

        # List imagery
        list_res = await client.get("/api/imagery")
        assert list_res.status_code == 200
        assert list_res.json()["success"] is True

        # Stats
        stats_res = await client.get("/api/imagery/stats")
        assert stats_res.status_code == 200
        stats_data = stats_res.json()["data"]
        assert "total_images" in stats_data
        assert "cached_images" in stats_data
