import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image

from backend.app.main import app
from backend.app.providers.vision.openclip import OpenCLIPRanker
from backend.app.providers.vision.siglip import SigLIPVisionRanker
from backend.app.services.benchmark import benchmark_service


@pytest.mark.asyncio
async def test_siglip_and_openclip_material_classification():
    # Test SigLIP 2 Provider
    siglip = SigLIPVisionRanker()
    info = siglip.get_info()
    assert info.name == "siglip2"
    assert info.is_local is True

    test_img = Image.new("RGB", (224, 224), color=(180, 50, 50))
    mat, conf, size = siglip.classify_material_and_size(test_img)
    assert isinstance(mat, str)
    assert 0.0 <= conf <= 1.0
    assert size in ["small", "medium", "large", "very_large"]

    # Test OpenCLIP Provider
    openclip = OpenCLIPRanker()
    mat2, conf2, size2 = openclip.classify_material_and_size(test_img)
    assert isinstance(mat2, str)
    assert 0.0 <= conf2 <= 1.0
    assert size2 in ["small", "medium", "large", "very_large"]


@pytest.mark.asyncio
async def test_benchmark_service_metrics():
    report = await benchmark_service.run_benchmark(
        job_id="test_bm_job",
        models=["openclip", "siglip2"],
    )

    assert report.evaluated_images_count == 50
    assert len(report.models_compared) == 2
    for m in report.models_compared:
        assert 0.0 <= m.precision_at_10 <= 100.0
        assert 0.0 <= m.precision_at_25 <= 100.0
        assert 0.0 <= m.precision_at_50 <= 100.0
        assert 0.0 <= m.recall_at_50 <= 100.0
        assert 0.0 <= m.material_accuracy <= 100.0
        assert m.avg_latency_ms >= 0.0
        assert "brick" in m.confusion_matrix


@pytest.mark.asyncio
async def test_benchmark_api_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Models listing
        m_res = await client.get("/api/benchmark/models")
        assert m_res.status_code == 200
        models = m_res.json()["data"]
        assert len(models) >= 2

        # Latest report
        l_res = await client.get("/api/benchmark/latest")
        assert l_res.status_code == 200
        l_data = l_res.json()["data"]
        assert "models_compared" in l_data

        # Trigger benchmark job
        run_res = await client.post(
            "/api/benchmark/run",
            json={"models": ["openclip", "siglip2"], "sample_limit": 50},
        )
        assert run_res.status_code == 200
        assert run_res.json()["data"]["job_type"] == "model_benchmark"

        # Hard Material Exclusion check on search
        search_res = await client.get("/api/export/search?excluded_materials=brick")
        assert search_res.status_code == 200
        for cand in search_res.json()["data"]:
            assert "brick" not in (cand.get("wall_material") or "").lower()
