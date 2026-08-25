import datetime
import io
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from PIL import Image, ImageDraw
from backend.app.providers.base import ProviderInfo, ProviderStatus
from backend.app.providers.imagery.base import ImageryProvider, StreetImageMetadata


class MockImageryProvider(ImageryProvider):
    """
    Mock Imagery Provider for Phase 1 testing and offline pipeline simulation.
    Generates synthetic street and building wall images with Pillow.
    """

    def get_info(self) -> ProviderInfo:
        return ProviderInfo(
            name="mock_imagery",
            provider_type="imagery",
            description="Mock street-level imagery provider for testing and pipeline validation",
            is_local=True,
            is_paid=False,
            status=ProviderStatus.AVAILABLE,
        )

    async def query_images_near_coordinates(
        self,
        lat: float,
        lon: float,
        radius_meters: float = 25.0,
        max_images: int = 3,
    ) -> List[StreetImageMetadata]:
        results: List[StreetImageMetadata] = []
        for i in range(min(max_images, 3)):
            img_id = f"mock_img_{uuid.uuid4().hex[:10]}"
            results.append(
                StreetImageMetadata(
                    id=img_id,
                    provider="mock",
                    latitude=lat + (i * 0.00005),
                    longitude=lon + (i * 0.00005),
                    heading=float((i * 90) % 360),
                    pitch=0.0,
                    capture_date=datetime.datetime.utcnow(),
                    source_url=f"http://mock-imagery.local/{img_id}.jpg",
                    width=1024,
                    height=768,
                    is_panoramic=False,
                )
            )
        return results

    async def download_image(
        self,
        image_meta: StreetImageMetadata,
        destination_path: Path,
    ) -> Path:
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        # Create a synthetic image showing a brick wall simulation
        img = Image.new("RGB", (640, 480), color=(180, 75, 60))
        draw = ImageDraw.Draw(img)
        # Draw some mock brick lines
        for y in range(0, 480, 40):
            draw.line([(0, y), (640, y)], fill=(120, 40, 30), width=2)
        for x in range(0, 640, 80):
            draw.line([(x, 0), (x, 480)], fill=(120, 40, 30), width=2)

        # Add mock metadata banner
        draw.rectangle([(20, 20), (320, 60)], fill=(20, 20, 20))
        draw.text((30, 30), f"Mock Image {image_meta.id[:10]}", fill=(255, 255, 255))

        img.save(destination_path, format="JPEG", quality=85)
        return destination_path
