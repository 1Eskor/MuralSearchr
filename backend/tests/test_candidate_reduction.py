import pytest
from httpx import ASGITransport, AsyncClient
from backend.app.main import app
from backend.app.services.reduction import haversine_distance_meters


def test_haversine_distance():
    # Distance between Wynwood Miami point A & point B (approx 111 meters)
    lat1, lon1 = 25.7995, -80.1985
    lat2, lon2 = 25.8005, -80.1985
    dist = haversine_distance_meters(lat1, lon1, lat2, lon2)
    assert 100.0 < dist < 125.0

    # Same point distance should be 0
    assert haversine_distance_meters(lat1, lon1, lat1, lon1) == 0.0


@pytest.mark.asyncio
async def test_candidate_reduction_api_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Trigger Reduction & Promotion Job
        req_payload = {
            "min_score": 0.40,
            "top_percentile": 0.30,
            "cluster_distance_meters": 20.0,
            "max_candidates": 30,
        }
        res = await client.post("/api/candidates/reduce", json=req_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["data"]["job_id"].startswith("job_")

        # List Candidates
        c_res = await client.get("/api/candidates?limit=10")
        assert c_res.status_code == 200
        c_data = c_res.json()
        assert c_data["success"] is True
        assert isinstance(c_data["data"], list)

        # Funnel Stats
        s_res = await client.get("/api/candidates/stats")
        assert s_res.status_code == 200
        s_data = s_res.json()["data"]
        assert "promoted_candidates" in s_data
        assert "noise_reduction_pct" in s_data
        assert "vlm_api_calls_saved" in s_data
