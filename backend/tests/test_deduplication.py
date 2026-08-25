import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app


@pytest.mark.asyncio
async def test_deduplication_api_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Trigger Deduplication Job
        req_payload = {
            "spatial_radius_meters": 15.0,
            "visual_sim_threshold": 0.90,
        }
        res = await client.post("/api/deduplication/run", json=req_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["data"]["job_id"].startswith("job_")

        # List Clustered Walls
        c_res = await client.get("/api/deduplication/clusters?limit=5")
        assert c_res.status_code == 200
        c_data = c_res.json()
        assert c_data["success"] is True
        assert isinstance(c_data["data"], list)

        # Deduplication Stats
        s_res = await client.get("/api/deduplication/stats")
        assert s_res.status_code == 200
        s_data = s_res.json()["data"]
        assert "unique_canonical_walls" in s_data
        assert "multi_view_pct" in s_data
