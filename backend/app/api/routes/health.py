import platform
import sys
from fastapi import APIRouter
from backend import __version__
from backend.app.core.config import get_settings
from backend.app.schemas.common import APIResponse
from backend.app.schemas.health import SystemInfo

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("", response_model=APIResponse[SystemInfo])
async def get_health_status():
    settings = get_settings()
    detected_device = settings.detected_device

    device_name = "CPU"
    if detected_device == "mps":
        device_name = "Apple Silicon Metal (MPS)"
    elif detected_device == "cuda":
        device_name = "NVIDIA CUDA GPU"

    info = SystemInfo(
        app_name=settings.APP_NAME,
        version=__version__,
        status="healthy",
        environment=settings.APP_ENV,
        debug=settings.DEBUG,
        detected_device=detected_device,
        device_name=device_name,
        python_version=sys.version.split()[0],
        os_platform=f"{platform.system()} {platform.machine()}",
        active_database="SQLite (async)",
        cache_status="ready",
    )

    return APIResponse(data=info, message="System operational")
