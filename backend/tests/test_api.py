import pytest
from httpx import ASGITransport, AsyncClient
from backend.app.main import app


@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["status"] == "healthy"
        assert "detected_device" in data["data"]


@pytest.mark.asyncio
async def test_config_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/config")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "scoring_weights" in data["data"]
        assert "active_providers" in data["data"]


@pytest.mark.asyncio
async def test_cache_stats_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/cache/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "total_files" in data["data"]


@pytest.mark.asyncio
async def test_pipeline_dry_run_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/pipeline/dry-run", json={})
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        job_id = data["data"]["job_id"]
        assert job_id.startswith("job_")

        # Query job status
        job_res = await client.get(f"/api/jobs/{job_id}")
        assert job_res.status_code == 200
