from typing import Dict, List, Optional
from backend.app.core.config import Settings, get_settings
from backend.app.core.logging import logger
from backend.app.providers.base import BaseProvider, ProviderInfo, ProviderStatus
from backend.app.providers.geodata.base import GeoDataProvider
from backend.app.providers.geodata.mock import MockGeoProvider
from backend.app.providers.geodata.osm import OSMOverpassProvider
from backend.app.providers.imagery.base import ImageryProvider
from backend.app.providers.imagery.local import LocalImageProvider
from backend.app.providers.imagery.mapillary import MapillaryProvider
from backend.app.providers.imagery.mock import MockImageryProvider
from backend.app.providers.vision.base import VisionAnalyzer, VisionRanker
from backend.app.providers.vision.mock import MockVisionAnalyzer, MockVisionRanker
from backend.app.providers.vision.openclip import OpenCLIPRanker
from backend.app.providers.vision.siglip import SigLIPVisionRanker
from backend.app.providers.vision.local_vlm import LocalVLMAnalyzer
from backend.app.providers.vision.openai import OpenAIVisionAnalyzer


class ProviderRegistry:
    """
    Central registry and dependency injection container for Geodata,
    Imagery, Vision, and Exposure providers.
    """

    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self._geodata_providers: Dict[str, GeoDataProvider] = {}
        self._imagery_providers: Dict[str, ImageryProvider] = {}
        self._vision_rankers: Dict[str, Any] = {}
        self._vision_analyzers: Dict[str, VisionAnalyzer] = {}

        self._register_defaults()

    def _register_defaults(self) -> None:
        """Register built-in provider implementations."""
        # Geodata
        self._geodata_providers["mock"] = MockGeoProvider()
        self._geodata_providers["osm"] = OSMOverpassProvider()
        self._geodata_providers["overpass"] = OSMOverpassProvider()

        # Imagery
        self._imagery_providers["mock"] = MockImageryProvider()
        self._imagery_providers["local"] = LocalImageProvider(self.settings.CACHE_DIR / "local_samples")
        self._imagery_providers["mapillary"] = MapillaryProvider(self.settings)

        # Vision Ranker
        self._vision_rankers["mock"] = MockVisionRanker()
        self._vision_rankers["openclip"] = OpenCLIPRanker(settings=self.settings)
        self._vision_rankers["clip"] = OpenCLIPRanker(settings=self.settings)
        self._vision_rankers["siglip"] = SigLIPVisionRanker()
        self._vision_rankers["siglip2"] = SigLIPVisionRanker()

        # Vision Analyzer
        self._vision_analyzers["mock"] = MockVisionAnalyzer()
        self._vision_analyzers["local_vlm"] = LocalVLMAnalyzer(settings=self.settings)
        self._vision_analyzers["vlm"] = LocalVLMAnalyzer(settings=self.settings)
        self._vision_analyzers["openai"] = OpenAIVisionAnalyzer(settings=self.settings)

    def get_geodata_provider(self, name: Optional[str] = None) -> GeoDataProvider:
        provider_name = name or self.settings.GEODATA_PROVIDER
        if provider_name in self._geodata_providers:
            return self._geodata_providers[provider_name]
        logger.warning(f"Geodata provider '{provider_name}' not found, falling back to 'mock'")
        return self._geodata_providers["mock"]

    def get_imagery_provider(self, name: Optional[str] = None) -> ImageryProvider:
        provider_name = name or self.settings.IMAGERY_PROVIDER
        if provider_name in self._imagery_providers:
            return self._imagery_providers[provider_name]
        logger.warning(f"Imagery provider '{provider_name}' not found, falling back to 'mock'")
        return self._imagery_providers["mock"]

    def get_vision_ranker(self, name: Optional[str] = None) -> VisionRanker:
        provider_name = name or self.settings.VISION_RANKER_PROVIDER
        if provider_name in self._vision_rankers:
            return self._vision_rankers[provider_name]
        logger.warning(f"Vision ranker '{provider_name}' not found, falling back to 'mock'")
        return self._vision_rankers["mock"]

    def get_vision_analyzer(self, name: Optional[str] = None) -> VisionAnalyzer:
        provider_name = name or self.settings.VISION_ANALYZER_PROVIDER
        if provider_name in self._vision_analyzers:
            return self._vision_analyzers[provider_name]
        logger.warning(f"Vision analyzer '{provider_name}' not found, falling back to 'mock'")
        return self._vision_analyzers["mock"]

    def list_all_providers(self) -> List[ProviderInfo]:
        """List metadata and status of all registered providers."""
        infos: List[ProviderInfo] = []
        for p in self._geodata_providers.values():
            infos.append(p.get_info())
        for p in self._imagery_providers.values():
            infos.append(p.get_info())
        for p in self._vision_rankers.values():
            infos.append(p.get_info())
        for p in self._vision_analyzers.values():
            infos.append(p.get_info())
        return infos


# Global registry instance
registry = ProviderRegistry()
