import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image
from backend.app.main import app
from backend.app.providers.vision.openclip import OpenCLIPRanker
from backend.app.services.ranker import VisionRankingService


@pytest.fixture
def synthetic_wall_image(tmp_path):
    img = Image.new("RGB", (256, 256), color=(180, 70, 50))  # Brick red
    path = tmp_path / "test_brick_wall.jpg"
    img.save(path)
    return path


@pytest.mark.asyncio
async def test_openclip_ranker_scoring(synthetic_wall_image):
    ranker = OpenCLIPRanker()
    info = ranker.get_info()
    assert info.provider_type == "vision_ranker"
    assert info.name == "openclip"

    res = await ranker.rank_image(synthetic_wall_image)
    assert 0.0 <= res.raw_score <= 1.0
    assert isinstance(res.wall_detected, bool)
    assert res.confidence >= 0.0


@pytest.mark.asyncio
async def test_ranking_api_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Get Prompts
        p_res = await client.get("/api/ranking/prompts")
        assert p_res.status_code == 200
        p_data = p_res.json()["data"]
        assert len(p_data["positive_prompts"]) > 0
        assert len(p_data["negative_prompts"]) > 0

        # Trigger batch ranking job
        rank_payload = {
            "provider": "openclip",
            "batch_size": 16,
        }
        r_res = await client.post("/api/ranking/rank", json=rank_payload)
        assert r_res.status_code == 200
        r_data = r_res.json()
        assert r_data["success"] is True
        job_id = r_data["data"]["job_id"]
        assert job_id.startswith("job_")

        # Top ranked views
        top_res = await client.get("/api/ranking/top?limit=10")
        assert top_res.status_code == 200
        assert top_res.json()["success"] is True

        # Stats & histogram
        stats_res = await client.get("/api/ranking/stats")
        assert stats_res.status_code == 200
        s_data = stats_res.json()["data"]
        assert "histogram" in s_data
        assert "passed_count" in s_data
