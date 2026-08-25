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
from backend.app.providers.imagery.mock import MockImageryProvider


class MapillaryProvider(ImageryProvider):
    """
    Mapillary Graph API v4 Street-Level Imagery Provider.
    Fetches street photography, compass headings, and multi-view perspectives.
    """

    BASE_URL = "https://graph.mapillary.com"

    def __init__(self, settings: Optional[Settings] = None, timeout_seconds: float = 10.0):
        self.settings = settings or get_settings()
        self.timeout_seconds = timeout_seconds
        self.mock_fallback = MockImageryProvider()

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
            logger.debug(f"Mapillary token not configured; generating realistic sample street imagery at ({lat}, {lon})")
            return await self._generate_fallback_imagery(lat, lon, max_images)

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
                    return results if results else await self._generate_fallback_imagery(lat, lon, max_images)
                else:
                    logger.warning(f"Mapillary API returned status {resp.status_code}: {resp.text}")

        except Exception as e:
            logger.warning(f"Mapillary query failed: {e}; falling back to synthetic imagery generator")

        return await self._generate_fallback_imagery(lat, lon, max_images)

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
            try:
                headers = {"Authorization": f"OAuth {self.token}"} if self.is_configured else {}
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.get(image_meta.source_url, headers=headers)
                    if resp.status_code == 200 and len(resp.content) > 500:
                        destination_path.write_bytes(resp.content)
                        return destination_path
            except Exception as e:
                logger.warning(f"Failed to download remote image from {image_meta.source_url}: {e}")

        # Fallback generator for simulated imagery or if remote download fails
        return await self._create_wall_simulation_image(image_meta, destination_path)

    async def _generate_fallback_imagery(
        self,
        lat: float,
        lon: float,
        count: int = 3,
    ) -> List[StreetImageMetadata]:
        """
        Generate realistic multi-perspective street view metadata for testing.
        """
        results: List[StreetImageMetadata] = []
        headings = [0.0, 90.0, 180.0, 270.0, 45.0, 135.0, 225.0, 315.0]

        for i in range(min(count, 4)):
            img_id = f"mly_sim_{uuid.uuid4().hex[:10]}"
            heading = headings[i % len(headings)]
            # Slight offset along street
            offset_lat = (i * 0.00008)
            offset_lon = (i * 0.00008)

            results.append(
                StreetImageMetadata(
                    id=img_id,
                    provider="mapillary",
                    latitude=lat + offset_lat,
                    longitude=lon + offset_lon,
                    heading=heading,
                    pitch=0.0,
                    capture_date=datetime.datetime.utcnow() - datetime.timedelta(days=i * 15),
                    source_url=f"http://mapillary.fallback/{img_id}.jpg",
                    width=1024,
                    height=768,
                    is_panoramic=False,
                    extra_metadata={"simulated": True, "texture_type": "brick_facade" if i % 2 == 0 else "concrete_wall"},
                )
            )
        return results

    async def _create_wall_simulation_image(
        self,
        image_meta: StreetImageMetadata,
        destination_path: Path,
    ) -> Path:
        """
        Render a high-contrast simulated street facade photo with building textures.
        """
        w, h = 1024, 768
        # Select palette based on image ID hash
        hash_val = hash(image_meta.id) % 3
        if hash_val == 0:
            # Industrial Red Brick
            wall_color = (168, 64, 50)
            mortar_color = (120, 45, 35)
            sky_color = (135, 180, 220)
        elif hash_val == 1:
            # Clean Concrete / Stucco Facade
            wall_color = (180, 185, 190)
            mortar_color = (150, 155, 160)
            sky_color = (120, 170, 215)
        else:
            # Commercial Warehouse Exterior
            wall_color = (195, 175, 140)
            mortar_color = (160, 140, 110)
            sky_color = (140, 185, 230)

        img = Image.new("RGB", (w, h), color=wall_color)
        draw = ImageDraw.Draw(img)

        # Draw Sky portion at top 20%
        draw.rectangle([(0, 0), (w, int(h * 0.22))], fill=sky_color)

        # Draw Sidewalk / Street portion at bottom 18%
        draw.rectangle([(0, int(h * 0.82)), (w, h)], fill=(60, 65, 70))
        draw.line([(0, int(h * 0.82)), (w, int(h * 0.82))], fill=(100, 105, 110), width=4)

        # Draw Brick / Joint lines on the wall
        for y in range(int(h * 0.22), int(h * 0.82), 24):
            draw.line([(0, y), (w, y)], fill=mortar_color, width=2)
        for x in range(0, w, 50):
            draw.line([(x, int(h * 0.22)), (x, int(h * 0.82))], fill=mortar_color, width=1)

        # Overlay Camera & GPS telemetry watermark banner
        banner_h = 50
        draw.rectangle([(0, h - banner_h), (w, h)], fill=(15, 23, 42))
        heading_text = f"Heading: {image_meta.heading:.1f}°" if image_meta.heading is not None else "Heading: N/A"
        date_str = image_meta.capture_date.strftime("%Y-%m-%d") if image_meta.capture_date else "Recent"
        watermark = f"Mural Search Imagery Ingestion  |  ID: {image_meta.id}  |  Lat: {image_meta.latitude:.5f}, Lon: {image_meta.longitude:.5f}  |  {heading_text}  |  Captured: {date_str}"
        draw.text((20, h - 32), watermark, fill=(240, 245, 255))

        img.save(destination_path, format="JPEG", quality=90)
        return destination_path
