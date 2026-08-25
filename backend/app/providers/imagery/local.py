import datetime
import os
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from PIL import Image
from backend.app.providers.base import ProviderInfo, ProviderStatus
from backend.app.providers.imagery.base import ImageryProvider, StreetImageMetadata


class LocalImageProvider(ImageryProvider):
    """
    Local Filesystem Imagery Provider.
    Allows ingesting and testing with custom street photos stored in a local directory.
    """

    def __init__(self, source_dir: Optional[Path] = None):
        self.source_dir = source_dir or Path("./data/local_images")
        self.source_dir.mkdir(parents=True, exist_ok=True)

    def get_info(self) -> ProviderInfo:
        exists = self.source_dir.exists()
        count = len(list(self.source_dir.glob("*.jp*g"))) + len(list(self.source_dir.glob("*.png"))) if exists else 0
        return ProviderInfo(
            name="local_imagery",
            provider_type="imagery",
            description=f"Local folder imagery provider ({count} local files available)",
            is_local=True,
            is_paid=False,
            status=ProviderStatus.AVAILABLE if count > 0 else ProviderStatus.NOT_CONFIGURED,
            status_message=f"Serving from: {self.source_dir}",
        )

    async def query_images_near_coordinates(
        self,
        lat: float,
        lon: float,
        radius_meters: float = 25.0,
        max_images: int = 5,
    ) -> List[StreetImageMetadata]:
        image_files = list(self.source_dir.glob("*.jp*g")) + list(self.source_dir.glob("*.png"))
        results: List[StreetImageMetadata] = []
        for i, file_path in enumerate(image_files[:max_images]):
            try:
                with Image.open(file_path) as img:
                    w, h = img.size
            except Exception:
                w, h = 1024, 768

            results.append(
                StreetImageMetadata(
                    id=f"local_{file_path.stem}",
                    provider="local",
                    latitude=lat + (i * 0.00002),
                    longitude=lon + (i * 0.00002),
                    heading=0.0,
                    pitch=0.0,
                    capture_date=datetime.datetime.fromtimestamp(os.path.getmtime(file_path)),
                    source_url=f"file://{file_path.resolve()}",
                    width=w,
                    height=h,
                    is_panoramic=False,
                    extra_metadata={"local_source_path": str(file_path.resolve())},
                )
            )
        return results

    async def download_image(
        self,
        image_meta: StreetImageMetadata,
        destination_path: Path,
    ) -> Path:
        source_path = None
        if image_meta.extra_metadata and "local_source_path" in image_meta.extra_metadata:
            source_path = Path(image_meta.extra_metadata["local_source_path"])
        
        if source_path and source_path.exists():
            destination_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, destination_path)
            return destination_path
        
        # Fallback if source file moved: create placeholder
        with Image.new("RGB", (640, 480), color=(100, 100, 100)) as img:
            img.save(destination_path, format="JPEG")
        return destination_path
