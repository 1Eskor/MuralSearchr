from typing import Dict, Optional
from pydantic import BaseModel


class SystemInfo(BaseModel):
    app_name: str
    version: str
    status: str
    environment: str
    debug: bool
    detected_device: str  # mps, cuda, cpu
    device_name: str
    python_version: str
    os_platform: str
    active_database: str
    cache_status: str
