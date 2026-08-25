import pytest
from pathlib import Path
from PIL import Image
from httpx import ASGITransport, AsyncClient

from backend.app.main import app
from backend.app.providers.vision.openai import OpenAIVisionAnalyzer
from backend.app.providers.vision.base import WallAttributes


@pytest.mark.asyncio
async def test_openai_vision_analyzer_simulation(tmp_path: Path):
    img_path = tmp_path / "test_wall.jpg"
    img = Image.new("RGB", (256, 256), color=(200, 100, 70))
    img.save(img_path)

    analyzer = OpenAIVisionAnalyzer(model_name="gpt-4o-mini")
    attr = await analyzer.analyze_wall(img_path)

    assert isinstance(attr, WallAttributes)
    assert attr.wall_present is True
    assert 0.0 <= attr.wall_quality <= 1.0
    assert 0.0 <= attr.confidence <= 1.0
    assert "OpenAI" in attr.reason or "Verification" in attr.reason


@pytest.mark.asyncio
async def test_openai_verification_api_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Check Status
        s_res = await client.get("/api/verification/status")
        assert s_res.status_code == 200
        s_data = s_res.json()["data"]
        assert "active_model" in s_data
        assert "openai_configured" in s_data

        # Trigger Verification Job
        req_payload = {"model": "gpt-4o-mini"}
        res = await client.post("/api/verification/verify", json=req_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["data"]["job_id"].startswith("job_")

        # List Verified Candidates
        c_res = await client.get("/api/verification/candidates?limit=10")
        assert c_res.status_code == 200
        c_data = c_res.json()
        assert c_data["success"] is True
        assert isinstance(c_data["data"], list)
