from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from backend.app.providers.base import ProviderInfo


class ConfigOverview(BaseModel):
    app_name: str
    environment: str
    detected_device: str
    scoring_weights: Dict[str, float]
    active_providers: Dict[str, str]
    all_providers: List[ProviderInfo]
    cache_settings: Dict[str, Any]
