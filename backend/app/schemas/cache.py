from typing import Optional
from pydantic import BaseModel


class CacheStatsResponse(BaseModel):
    cache_dir: str
    total_files: int
    total_bytes: int
    total_mb: float
    max_mb: int
    usage_percent: float


class CachePurgeResponse(BaseModel):
    cleared_items: int
    message: str
