import pytest
from pathlib import Path
from PIL import Image
from httpx import ASGITransport, AsyncClient

from backend.app.main import app
from backend.app.providers.vision.local_vlm import LocalVLMAnalyzer
from backend.app.providers.vision.base import WallAttributes


@pytest.mark.asyncio
async def test_local_vlm_analyzer(tmp_path: Path):
    # Create test synthetic image
    img_path = tmp_path / "test_wall.jpg"
    img = Image.new("RGB", (256, 256), color=(180, 80, 60))  # Brick-like red tone
    img.save(img_path)

    analyzer = LocalVLMAnalyzer()
    attr = await analyzer.analyze_wall(img_path)

    assert isinstance(attr, WallAttributes)
    assert attr.wall_present is True
    assert 0.0 <= attr.wall_quality <= 1.0
    assert 0.0 <= attr.blankness <= 1.0
    assert 0.0 <= attr.visibility <= 1.0
    assert 0.0 <= attr.accessibility <= 1.0
    assert attr.wall_material in ["brick", "concrete", "stucco", "metal", "wood", "glass", "masonry"]
    assert attr.size_class in ["small", "medium", "large", "very_large"]
    assert len(attr.reason) > 10


@pytest.mark.asyncio
async def test_vision_analysis_api_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Trigger Analysis Job
        req_payload = {"provider": "local_vlm"}
        res = await client.post("/api/analysis/analyze", json=req_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["data"]["job_id"].startswith("job_")

        # List Analyzed Candidates
        c_res = await client.get("/api/analysis/candidates?limit=10")
        assert c_res.status_code == 200
        c_data = c_res.json()
        assert c_data["success"] is True
        assert isinstance(c_data["data"], list)

        # Analysis Stats
        s_res = await client.get("/api/analysis/stats")
        assert s_res.status_code == 200
        s_data = s_res.json()["data"]
        assert "total_analyzed" in s_data
        assert "materials_breakdown" in s_data
        assert "avg_blankness_pct" in s_data
