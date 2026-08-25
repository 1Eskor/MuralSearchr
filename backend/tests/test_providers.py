import pytest
from pathlib import Path
from backend.app.providers.geodata.mock import MockGeoProvider
from backend.app.providers.imagery.mock import MockImageryProvider
from backend.app.providers.vision.mock import MockVisionAnalyzer, MockVisionRanker
from backend.app.providers.registry import ProviderRegistry


@pytest.mark.asyncio
async def test_mock_geodata_provider():
    provider = MockGeoProvider()
    info = provider.get_info()
    assert info.provider_type == "geodata"

    poly = {"type": "Polygon", "coordinates": [[[-74.0, 40.7], [-74.0, 40.8], [-73.9, 40.8], [-73.9, 40.7], [-74.0, 40.7]]]}
    roads = await provider.extract_roads(poly)
    assert len(roads) > 0

    points = await provider.generate_sample_points(poly)
    assert len(points) > 0
    assert hasattr(points[0], "latitude")
    assert hasattr(points[0], "longitude")


@pytest.mark.asyncio
async def test_mock_imagery_provider(tmp_path):
    provider = MockImageryProvider()
    metas = await provider.query_images_near_coordinates(40.7128, -74.0060, max_images=2)
    assert len(metas) == 2

    dest = tmp_path / "test_download.jpg"
    saved = await provider.download_image(metas[0], dest)
    assert saved.exists()
    assert saved.stat().st_size > 0


@pytest.mark.asyncio
async def test_mock_vision_providers(tmp_path):
    ranker = MockVisionRanker()
    analyzer = MockVisionAnalyzer()

    # Create 2 dummy files
    f1 = tmp_path / "img1.jpg"
    f2 = tmp_path / "img2.jpg"
    f1.write_bytes(b"mock1")
    f2.write_bytes(b"mock2")

    ranks = await ranker.rank_images([f1, f2])
    assert len(ranks) == 2
    assert ranks[0].composite_rank >= ranks[1].composite_rank

    attrs = await analyzer.analyze_wall(f1)
    assert attrs.wall_present is True
    assert 0.0 <= attrs.wall_quality <= 1.0
    assert attrs.size_class in ("small", "medium", "large", "very_large")


def test_provider_registry():
    reg = ProviderRegistry()
    geo = reg.get_geodata_provider("mock")
    assert geo is not None
    img = reg.get_imagery_provider("mock")
    assert img is not None
    ranker = reg.get_vision_ranker("mock")
    assert ranker is not None
    analyzer = reg.get_vision_analyzer("mock")
    assert analyzer is not None
