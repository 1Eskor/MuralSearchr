import pytest
from PIL import Image
from httpx import ASGITransport, AsyncClient
from backend.app.main import app
from backend.app.services.view_generator import ViewGeneratorService


@pytest.fixture
def synthetic_pano():
    """Create a 1024x512 gradient test panorama."""
    img = Image.new("RGB", (1024, 512), color=(100, 150, 200))
    return img


@pytest.fixture
def synthetic_flat():
    """Create a standard 800x600 flat street photo."""
    img = Image.new("RGB", (800, 600), color=(180, 80, 60))
    return img


def test_equirectangular_projection(synthetic_pano):
    service = ViewGeneratorService()
    # Project view at yaw=0, 90, 180, 270
    view_0 = service.equirectangular_to_rectilinear(synthetic_pano, yaw_deg=0.0, fov_deg=90.0, out_width=256, out_height=256)
    assert view_0.size == (256, 256)

    view_90 = service.equirectangular_to_rectilinear(synthetic_pano, yaw_deg=90.0, fov_deg=90.0, out_width=256, out_height=256)
    assert view_90.size == (256, 256)


def test_slice_image_perspectives_pano(synthetic_pano):
    service = ViewGeneratorService()
    headings = [0.0, 90.0, 180.0, 270.0]
    slices = service.slice_image_perspectives(
        src_img=synthetic_pano,
        headings=headings,
        base_heading=45.0,
        fov_deg=90.0,
        is_panoramic=True,
        out_size=(256, 256),
    )
    assert len(slices) == 4
    for s in slices:
        assert s["is_sliced"] is True
        assert s["image"].size == (256, 256)
        assert s["heading"] in [45.0, 135.0, 225.0, 315.0]


def test_slice_image_perspectives_flat(synthetic_flat):
    service = ViewGeneratorService()
    slices = service.slice_image_perspectives(
        src_img=synthetic_flat,
        headings=[0.0, 90.0, 180.0, 270.0],
        base_heading=180.0,
        is_panoramic=False,
        out_size=(256, 256),
    )
    # Flat image with aspect 800/600=1.33 produces center crop + left/right perspective crops
    assert len(slices) >= 1
    assert slices[0]["image"].size == (256, 256)


@pytest.mark.asyncio
async def test_view_generation_api():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Trigger view generation
        gen_payload = {
            "headings_count": 4,
            "fov_degrees": 90.0,
            "resolution": 256,
        }
        res = await client.post("/api/views/generate", json=gen_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        job_id = data["data"]["job_id"]
        assert job_id.startswith("job_")

        # List candidate views
        list_res = await client.get("/api/views")
        assert list_res.status_code == 200
        assert list_res.json()["success"] is True

        # View stats
        stats_res = await client.get("/api/views/stats")
        assert stats_res.status_code == 200
        stats_data = stats_res.json()["data"]
        assert "total_views" in stats_data
        assert "panoramic_slices" in stats_data
