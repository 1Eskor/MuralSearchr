import hashlib
import os
import shutil
from pathlib import Path
from typing import Dict, List, Optional
import aiofiles
from backend.app.core.config import Settings, get_settings
from backend.app.core.logging import logger


class ImageCacheManager:
    """
    Local filesystem image cache manager with SHA-256 deduplication and disk management.
    """

    def __init__(self, cache_dir: Optional[Path] = None, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self.cache_dir = cache_dir or self.settings.CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    @property
    def max_size_bytes(self) -> int:
        return self.settings.MAX_CACHE_SIZE_MB * 1024 * 1024

    def compute_hash(self, data: bytes) -> str:
        """Compute SHA-256 hexadecimal hash for byte content."""
        return hashlib.sha256(data).hexdigest()

    async def get_image_path(self, file_hash: str) -> Optional[Path]:
        """Return the path to a cached image if it exists."""
        # 2-level directory sharding based on hash prefix: cache/ab/cd/abcdef...jpg
        prefix = file_hash[:2]
        target = self.cache_dir / prefix / f"{file_hash}.jpg"
        if target.exists():
            return target
        return None

    async def save_image(self, data: bytes, custom_id: Optional[str] = None) -> Dict[str, any]:
        """
        Save binary image data to the local disk cache with SHA-256 deduplication.
        """
        file_hash = self.compute_hash(data)
        prefix = file_hash[:2]
        shard_dir = self.cache_dir / prefix
        shard_dir.mkdir(parents=True, exist_ok=True)

        target_file = shard_dir / f"{file_hash}.jpg"
        is_new = not target_file.exists()

        if is_new:
            async with aiofiles.open(target_file, "wb") as f:
                await f.write(data)
            logger.debug(f"Saved image to cache: {target_file} ({len(data)} bytes)")

        return {
            "file_hash": file_hash,
            "local_path": str(target_file.resolve()),
            "size_bytes": len(data),
            "is_new": is_new,
            "relative_url": f"/api/cache/images/{file_hash}",
        }

    async def save_file_copy(self, source_path: Path) -> Dict[str, any]:
        """Read existing file, compute hash, and cache it."""
        async with aiofiles.open(source_path, "rb") as f:
            data = await f.read()
        return await self.save_image(data)

    def get_stats(self) -> Dict[str, any]:
        """
        Calculate cache statistics (file count, total bytes, usage percentage).
        """
        total_bytes = 0
        file_count = 0

        for root, _, files in os.walk(self.cache_dir):
            for file in files:
                if file.startswith("."):
                    continue
                file_path = os.path.join(root, file)
                try:
                    total_bytes += os.path.getsize(file_path)
                    file_count += 1
                except (OSError, FileNotFoundError):
                    continue

        usage_pct = round((total_bytes / self.max_size_bytes) * 100, 2) if self.max_size_bytes > 0 else 0.0

        return {
            "cache_dir": str(self.cache_dir.resolve()),
            "total_files": file_count,
            "total_bytes": total_bytes,
            "total_mb": round(total_bytes / (1024 * 1024), 2),
            "max_mb": self.settings.MAX_CACHE_SIZE_MB,
            "usage_percent": usage_pct,
        }

    def clear_cache(self) -> int:
        """
        Purge all cached files and subdirectories.
        """
        count = 0
        for item in self.cache_dir.iterdir():
            if item.name.startswith("."):
                continue
            if item.is_dir():
                shutil.rmtree(item)
                count += 1
            elif item.is_file():
                item.unlink()
                count += 1
        logger.info(f"Cleared image cache: removed {count} entries.")
        return count


# Global cache manager instance
cache_manager = ImageCacheManager()
