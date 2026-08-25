import datetime
import math
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx
from PIL import Image, ImageDraw

from backend.app.core.config import Settings, get_settings
from backend.app.core.logging import logger
from backend.app.providers.base import ProviderInfo, ProviderStatus
from backend.app.providers.imagery.base import ImageryProvider, StreetImageMetadata


class MapillaryProvider(ImageryProvider):
    """
    Mapillary Graph API v4 Street-Level Imagery Provider.
    Fetches street photography, compass headings, and multi-view perspectives.
    """

    BASE_URL = "https://graph.mapillary.com"

    def __init__(self, settings: Optional[Settings] = None, timeout_seconds: float = 10.0):
        self.settings = settings or get_settings()
        self.timeout_seconds = timeout_seconds

    @property
    def token(self) -> str:
        return (self.settings.MAPILLARY_CLIENT_TOKEN or "").strip()

    @property
    def is_configured(self) -> bool:
        return bool(self.token and len(self.token) > 10)

    def get_info(self) -> ProviderInfo:
        if self.is_configured:
            return ProviderInfo(
                name="mapillary",
                provider_type="imagery",
                description="Mapillary Graph API v4 Street-Level Photography Provider",
                is_local=False,
                is_paid=False,
                status=ProviderStatus.CONFIGURED,
                status_message="Connected with active Mapillary client token",
            )
        else:
            return ProviderInfo(
                name="mapillary",
                provider_type="imagery",
                description="Mapillary Graph API v4 (Running in Local Fallback mode - add token in .env for live API)",
                is_local=True,
                is_paid=False,
                status=ProviderStatus.AVAILABLE,
                status_message="Local Fallback active (set MAPILLARY_CLIENT_TOKEN in .env for live API access)",
            )

    async def query_images_near_coordinates(
        self,
        lat: float,
        lon: float,
        radius_meters: float = 25.0,
        max_images: int = 5,
    ) -> List[StreetImageMetadata]:
        """
        Query Mapillary Graph API v4 for street photos within a bounding box around (lat, lon).
        """
        if not self.is_configured:
            logger.warning("Mapillary client token not configured in .env.")
            return []

        # Calculate bounding box around center point in degrees
        lat_delta = radius_meters / 111320.0
        lon_delta = radius_meters / (111320.0 * math.cos(math.radians(lat)))
        bbox = f"{lon - lon_delta:.6f},{lat - lat_delta:.6f},{lon + lon_delta:.6f},{lat + lat_delta:.6f}"

        url = f"{self.BASE_URL}/images"
        params = {
            "bbox": bbox,
            "fields": "id,computed_geometry,geometry,compass_angle,captured_at,thumb_1024_url,thumb_2048_url,is_pano,height,width,altitude",
            "limit": max_images,
        }
        headers = {"Authorization": f"OAuth {self.token}"}

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                resp = await client.get(url, params=params, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    items = data.get("data", [])
                    results: List[StreetImageMetadata] = []

                    for item in items:
                        geom = item.get("computed_geometry") or item.get("geometry") or {}
                        coords = geom.get("coordinates", [lon, lat])
                        
                        captured_at = None
                        if item.get("captured_at"):
                            try:
                                captured_at = datetime.datetime.fromtimestamp(item["captured_at"] / 1000.0)
                            except Exception:
                                pass

                        img_url = item.get("thumb_1024_url") or item.get("thumb_2048_url")
                        results.append(
                            StreetImageMetadata(
                                id=f"mly_{item['id']}",
                                provider="mapillary",
                                latitude=coords[1],
                                longitude=coords[0],
                                heading=item.get("compass_angle"),
                                pitch=0.0,
                                capture_date=captured_at,
                                source_url=img_url,
                                width=item.get("width", 1024),
                                height=item.get("height", 768),
                                is_panoramic=bool(item.get("is_pano", False)),
                                extra_metadata={"mapillary_id": item["id"], "altitude": item.get("altitude")},
                            )
                        )

                    logger.info(f"Retrieved {len(results)} street images from Mapillary at ({lat:.5f}, {lon:.5f})")
                    return results
                else:
                    logger.warning(f"Mapillary API returned status {resp.status_code}: {resp.text}")

        except Exception as e:
            logger.warning(f"Mapillary query failed at ({lat:.5f}, {lon:.5f}): {e}")

        return []

    async def download_image(
        self,
        image_meta: StreetImageMetadata,
        destination_path: Path,
    ) -> Path:
        """
        Download street photography bytes from URL and save to destination path.
        """
        destination_path.parent.mkdir(parents=True, exist_ok=True)

        # Only attempt remote download if it's a real live external URL
        is_live_url = (
            image_meta.source_url
            and image_meta.source_url.startswith("http")
            and not any(k in image_meta.source_url for k in ["mock-imagery", "mapillary.fallback", "local"])
        )

        if is_live_url:
            headers = {"Authorization": f"OAuth {self.token}"} if self.is_configured else {}
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(image_meta.source_url, headers=headers)
                if resp.status_code == 200 and len(resp.content) > 500:
                    destination_path.write_bytes(resp.content)
                    return destination_path
                else:
                    logger.warning(f"Failed to download image {image_meta.id} (status: {resp.status_code})")

        raise ValueError(f"Unable to download real street imagery for {image_meta.id} from {image_meta.source_url}")
