import pytest
from pathlib import Path
from backend.app.services.cache import ImageCacheManager


@pytest.mark.asyncio
async def test_cache_save_and_deduplication(tmp_path):
    cache = ImageCacheManager(cache_dir=tmp_path)

    # 1. Save new image bytes
    data1 = b"test_image_bytes_content_alpha"
    res1 = await cache.save_image(data1)
    assert res1["is_new"] is True
    assert "file_hash" in res1
    assert Path(res1["local_path"]).exists()

    # 2. Save identical image bytes (deduplication check)
    res2 = await cache.save_image(data1)
    assert res2["is_new"] is False
    assert res2["file_hash"] == res1["file_hash"]

    # 3. Retrieve image path
    path = await cache.get_image_path(res1["file_hash"])
    assert path is not None
    assert path.exists()

    # 4. Check cache statistics
    stats = cache.get_stats()
    assert stats["total_files"] == 1
    assert stats["total_bytes"] == len(data1)

    # 5. Clear cache
    cleared = cache.clear_cache()
    assert cleared >= 1
    stats_after = cache.get_stats()
    assert stats_after["total_files"] == 0
