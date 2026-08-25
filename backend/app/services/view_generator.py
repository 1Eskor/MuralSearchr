import asyncio
import math
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import Settings, get_settings
from backend.app.core.database import async_session_factory
from backend.app.core.logging import logger
from backend.app.models.candidate import CandidateView
from backend.app.models.imagery import Imagery
from backend.app.services.cache import ImageCacheManager, cache_manager
from backend.app.services.job_runner import JobManager, job_manager


class ViewGeneratorService:
    """
    Directional Slicing and Perspective Normalization Engine.
    Converts 360/equirectangular panoramas and wide street imagery into
    isolated, rectified pinhole camera views for AI vision analysis.
    """

    def __init__(
        self,
        image_cache: Optional[ImageCacheManager] = None,
        job_mgr: Optional[JobManager] = None,
        settings: Optional[Settings] = None,
    ):
        self.cache = image_cache or cache_manager
        self.jobs = job_mgr or job_manager
        self.settings = settings or get_settings()

    def equirectangular_to_rectilinear(
        self,
        src_img: Image.Image,
        yaw_deg: float,
        pitch_deg: float = 0.0,
        fov_deg: float = 90.0,
        out_width: int = 512,
        out_height: int = 512,
    ) -> Image.Image:
        """
        Vectorized equirectangular 360 projection to perspective rectilinear pinhole view.
        """
        src_w, src_h = src_img.size
        src_arr = np.array(src_img)

        # Output pixel grid
        x = np.linspace(-1.0, 1.0, out_width)
        y = np.linspace(-1.0, 1.0, out_height)
        xx, yy = np.meshgrid(x, y)

        # Pinhole camera ray direction
        focal = 1.0 / np.tan(np.radians(fov_deg) / 2.0)
        # Camera coords: z forward, x right, y down
        rays = np.stack([xx, -yy, np.full_like(xx, focal)], axis=-1)
        # Normalize rays
        norm = np.linalg.norm(rays, axis=-1, keepdims=True)
        rays_norm = rays / np.maximum(norm, 1e-8)

        # Rotation matrices for Yaw and Pitch
        yaw_rad = np.radians(yaw_deg)
        pitch_rad = np.radians(pitch_deg)

        # Rotation around Y axis (yaw)
        cos_y, sin_y = np.cos(yaw_rad), np.sin(yaw_rad)
        r_yaw = np.array([[cos_y, 0, sin_y], [0, 1, 0], [-sin_y, 0, cos_y]])

        # Rotation around X axis (pitch)
        cos_p, sin_p = np.cos(pitch_rad), np.sin(pitch_rad)
        r_pitch = np.array([[1, 0, 0], [0, cos_p, -sin_p], [0, sin_p, cos_p]])

        r_matrix = r_yaw @ r_pitch

        # Apply rotation to rays
        rotated_rays = rays_norm @ r_matrix.T

        rx = rotated_rays[..., 0]
        ry = rotated_rays[..., 1]
        rz = rotated_rays[..., 2]

        # Convert 3D rotated rays to spherical coordinates (theta=lat, phi=lon)
        phi = np.arctan2(rx, rz)  # Longitude [-pi, pi]
        theta = np.arcsin(np.clip(ry, -1.0, 1.0))  # Latitude [-pi/2, pi/2]

        # Map spherical coordinates to source image pixel space
        u = ((phi / (2 * np.pi) + 0.5) * src_w) % src_w
        v = ((-theta / np.pi + 0.5) * src_h)
        v = np.clip(v, 0, src_h - 1)

        u_idx = u.astype(np.int32)
        v_idx = v.astype(np.int32)

        # Sample texture
        out_arr = src_arr[v_idx, u_idx]
        return Image.fromarray(out_arr)

    def slice_image_perspectives(
        self,
        src_img: Image.Image,
        headings: List[float],
        base_heading: Optional[float] = 0.0,
        fov_deg: float = 90.0,
        is_panoramic: bool = False,
        out_size: Tuple[int, int] = (512, 512),
    ) -> List[Dict[str, Any]]:
        """
        Generate directional perspective views from either a 360 panorama or a flat photo.
        """
        w, h = src_img.size
        aspect = w / float(h)
        views: List[Dict[str, Any]] = []

        # If 360 equirectangular or very wide (aspect >= 1.9)
        if is_panoramic or aspect >= 1.9:
            for h_deg in headings:
                effective_heading = (h_deg + (base_heading or 0.0)) % 360.0
                sliced_pil = self.equirectangular_to_rectilinear(
                    src_img,
                    yaw_deg=effective_heading,
                    pitch_deg=0.0,
                    fov_deg=fov_deg,
                    out_width=out_size[0],
                    out_height=out_size[1],
                )
                views.append(
                    {
                        "image": sliced_pil,
                        "heading": round(effective_heading, 1),
                        "fov": fov_deg,
                        "pitch": 0.0,
                        "is_sliced": True,
                        "crop_box": None,
                    }
                )
        else:
            # Flat standard perspective photo: generate directional center & perspective crops
            center_crop = self._center_crop(src_img, out_size)
            views.append(
                {
                    "image": center_crop,
                    "heading": round(base_heading or 0.0, 1),
                    "fov": fov_deg,
                    "pitch": 0.0,
                    "is_sliced": False,
                    "crop_box": {"x": 0, "y": 0, "w": w, "h": h},
                }
            )

            # If aspect is moderately wide, generate left and right offset perspective crops
            if aspect > 1.3:
                left_crop = self._aspect_offset_crop(src_img, out_size, offset_pct=-0.25)
                right_crop = self._aspect_offset_crop(src_img, out_size, offset_pct=0.25)
                views.append(
                    {
                        "image": left_crop,
                        "heading": round(((base_heading or 0.0) - 30.0) % 360.0, 1),
                        "fov": fov_deg * 0.8,
                        "pitch": 0.0,
                        "is_sliced": False,
                        "crop_box": {"x": 0, "y": 0, "w": int(w * 0.7), "h": h},
                    }
                )
                views.append(
                    {
                        "image": right_crop,
                        "heading": round(((base_heading or 0.0) + 30.0) % 360.0, 1),
                        "fov": fov_deg * 0.8,
                        "pitch": 0.0,
                        "is_sliced": False,
                        "crop_box": {"x": int(w * 0.3), "y": 0, "w": int(w * 0.7), "h": h},
                    }
                )

        return views

    def _center_crop(self, img: Image.Image, out_size: Tuple[int, int]) -> Image.Image:
        w, h = img.size
        min_dim = min(w, h)
        left = (w - min_dim) // 2
        top = (h - min_dim) // 2
        cropped = img.crop((left, top, left + min_dim, top + min_dim))
        return cropped.resize(out_size, Image.Resampling.LANCZOS)

    def _aspect_offset_crop(self, img: Image.Image, out_size: Tuple[int, int], offset_pct: float) -> Image.Image:
        w, h = img.size
        crop_size = min(w, h)
        center_x = (w // 2) + int(offset_pct * (w - crop_size))
        left = max(0, min(w - crop_size, center_x - crop_size // 2))
        top = (h - crop_size) // 2
        cropped = img.crop((left, top, left + crop_size, top + crop_size))
        return cropped.resize(out_size, Image.Resampling.LANCZOS)

    async def generate_views_for_imagery_batch(
        self,
        job_id: str,
        imagery_ids: Optional[List[int]] = None,
        headings_count: int = 4,
        fov_degrees: float = 90.0,
        resolution: int = 512,
    ) -> Dict[str, Any]:
        """
        Batch process ingested imagery records into standardized directional candidate views.
        """
        start_time = time.time()
        headings = [i * (360.0 / headings_count) for i in range(headings_count)]

        await self.jobs.update_job(
            job_id,
            status="running",
            step_index=1,
            step_name="Loading Ingested Imagery Records",
            message="Querying street imagery records for perspective slicing...",
            progress=10.0,
        )

        async with async_session_factory() as session:
            stmt = select(Imagery).where(Imagery.is_cached == True)
            if imagery_ids:
                stmt = stmt.where(Imagery.id.in_(imagery_ids))
            stmt = stmt.order_by(Imagery.id.desc()).limit(100)
            res = await session.execute(stmt)
            imagery_records = list(res.scalars().all())

        if not imagery_records:
            return {
                "status": "completed",
                "total_source_images": 0,
                "total_views_generated": 0,
                "duration_seconds": 0.0,
                "views": [],
            }

        total_source = len(imagery_records)
        await self.jobs.update_job(
            job_id,
            step_index=2,
            step_name="Generating Directional Perspective Views",
            message=f"Slicing {total_source} images at {headings_count} headings ({headings})...",
            progress=25.0,
        )

        generated_views_data: List[Dict[str, Any]] = []
        out_size = (resolution, resolution)

        for i, img_rec in enumerate(imagery_records):
            # Load cached image from local disk
            cached_file = await self.cache.get_image_path(img_rec.file_hash)
            if not cached_file or not cached_file.exists():
                continue

            try:
                with Image.open(cached_file) as pil_img:
                    pil_img = pil_img.convert("RGB")
                    is_pano = bool(img_rec.width and img_rec.height and (img_rec.width / img_rec.height) >= 1.9)
                    
                    # Generate directional perspective slices
                    sliced_items = self.slice_image_perspectives(
                        src_img=pil_img,
                        headings=headings,
                        base_heading=img_rec.heading,
                        fov_deg=fov_degrees,
                        is_panoramic=is_pano,
                        out_size=out_size,
                    )

                    for item in sliced_items:
                        # Save slice to temporary buffer and cache it
                        temp_path = self.settings.CACHE_DIR / "temp" / f"slice_{uuid.uuid4().hex[:8]}.jpg"
                        temp_path.parent.mkdir(parents=True, exist_ok=True)
                        item["image"].save(temp_path, format="JPEG", quality=92)

                        cached_res = await self.cache.save_file_copy(temp_path)
                        if temp_path.exists():
                            temp_path.unlink()

                        generated_views_data.append(
                            {
                                "imagery_id": img_rec.id,
                                "view_heading": item["heading"],
                                "pitch": item["pitch"],
                                "fov_degrees": item["fov"],
                                "crop_box_json": item["crop_box"],
                                "file_hash": cached_res["file_hash"],
                                "local_path": cached_res["local_path"],
                                "width": out_size[0],
                                "height": out_size[1],
                                "is_sliced_from_pano": item["is_sliced"],
                                "source_latitude": img_rec.latitude,
                                "source_longitude": img_rec.longitude,
                            }
                        )

            except Exception as e:
                logger.warning(f"Failed slicing imagery #{img_rec.id}: {e}")

            # Update progress
            pct = 25.0 + ((i + 1) / total_source) * 60.0
            await self.jobs.update_job(
                job_id,
                progress=pct,
                message=f"Processed {i + 1} of {total_source} source images ({len(generated_views_data)} views created)...",
            )

        await self.jobs.update_job(
            job_id,
            step_index=3,
            step_name="Persisting Candidate Views to Database",
            message=f"Saving {len(generated_views_data)} perspective views into SQLite...",
            progress=90.0,
        )

        # Persist candidate_views records in SQLite
        saved_view_dtos: List[Dict[str, Any]] = []

        async with async_session_factory() as session:
            for v_data in generated_views_data:
                # Check if hash already exists in CandidateView
                stmt = select(CandidateView).where(CandidateView.file_hash == v_data["file_hash"])
                existing = (await session.execute(stmt)).scalar_one_or_none()

                if not existing:
                    c_view = CandidateView(
                        imagery_id=v_data["imagery_id"],
                        candidate_id=None,
                        view_heading=v_data["view_heading"],
                        pitch=v_data["pitch"],
                        fov_degrees=v_data["fov_degrees"],
                        crop_box_json=v_data["crop_box_json"],
                        file_hash=v_data["file_hash"],
                        local_path=v_data["local_path"],
                        width=v_data["width"],
                        height=v_data["height"],
                        is_sliced_from_pano=v_data["is_sliced_from_pano"],
                    )
                    session.add(c_view)
                    await session.flush()
                    await session.refresh(c_view)
                    saved_row = c_view
                else:
                    saved_row = existing

                saved_view_dtos.append(
                    {
                        "id": saved_row.id,
                        "imagery_id": saved_row.imagery_id,
                        "view_heading": saved_row.view_heading,
                        "pitch": saved_row.pitch,
                        "fov_degrees": saved_row.fov_degrees,
                        "crop_box_json": saved_row.crop_box_json,
                        "file_hash": saved_row.file_hash,
                        "width": saved_row.width,
                        "height": saved_row.height,
                        "is_sliced_from_pano": saved_row.is_sliced_from_pano,
                        "preview_url": f"/api/cache/images/{saved_row.file_hash}",
                        "created_at": saved_row.created_at.isoformat() if saved_row.created_at else None,
                    }
                )

            await session.commit()

        duration = round(time.time() - start_time, 2)
        summary = {
            "status": "success",
            "total_source_images": total_source,
            "total_views_generated": len(saved_view_dtos),
            "duration_seconds": duration,
            "views": saved_view_dtos[:30],
        }

        return summary


view_generator_service = ViewGeneratorService()
