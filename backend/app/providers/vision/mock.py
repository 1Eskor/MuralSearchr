import random
from pathlib import Path
from typing import Any, Dict, List, Optional
from backend.app.providers.base import ProviderInfo, ProviderStatus
from backend.app.providers.vision.base import (
    ImageRankScore,
    VisionAnalyzer,
    VisionRanker,
    WallAttributes,
)


class MockVisionRanker(VisionRanker):
    """
    Mock CLIP Vision Ranker for Phase 1 testing and offline pipeline simulation.
    """

    def get_info(self) -> ProviderInfo:
        return ProviderInfo(
            name="mock_clip_ranker",
            provider_type="vision_ranker",
            description="Mock OpenCLIP/SigLIP ranker for offline testing and pipeline verification",
            is_local=True,
            is_paid=False,
            status=ProviderStatus.AVAILABLE,
        )

    async def rank_images(
        self,
        image_paths: List[Path],
        positive_prompts: Optional[List[str]] = None,
        negative_prompts: Optional[List[str]] = None,
        batch_size: int = 16,
    ) -> List[ImageRankScore]:
        results: List[ImageRankScore] = []
        for i, img_path in enumerate(image_paths):
            # Deterministic pseudo-ranking based on index
            wall_score = max(0.2, min(0.95, 0.90 - (i * 0.05)))
            blank_score = max(0.1, min(0.92, 0.85 - (i * 0.04)))
            building_score = max(0.3, min(0.98, 0.88 - (i * 0.03)))
            obstruction = min(0.8, 0.15 + (i * 0.05))

            composite = (wall_score * 0.4 + blank_score * 0.3 + building_score * 0.3) - (obstruction * 0.2)

            results.append(
                ImageRankScore(
                    image_path=img_path,
                    image_id=img_path.stem,
                    composite_rank=round(composite, 4),
                    wall_score=round(wall_score, 4),
                    blank_wall_score=round(blank_score, 4),
                    building_score=round(building_score, 4),
                    obstruction_score=round(obstruction, 4),
                )
            )

        # Sort descending by composite rank
        results.sort(key=lambda r: r.composite_rank, reverse=True)
        return results


class MockVisionAnalyzer(VisionAnalyzer):
    """
    Mock Vision-Language Analyzer for Phase 1 testing and offline pipeline simulation.
    """

    def get_info(self) -> ProviderInfo:
        return ProviderInfo(
            name="mock_vlm_analyzer",
            provider_type="vision_analyzer",
            description="Mock VLM/OpenAI structured analyzer for Phase 1 testing",
            is_local=True,
            is_paid=False,
            status=ProviderStatus.AVAILABLE,
        )

    async def analyze_wall(
        self,
        image_path: Path,
        context: Optional[Dict[str, Any]] = None,
    ) -> WallAttributes:
        return WallAttributes(
            wall_present=True,
            wall_quality=0.91,
            blankness=0.88,
            visibility=0.85,
            accessibility=0.92,
            obstructions=0.15,
            existing_artwork=False,
            size_class="large",
            confidence=0.90,
            reason="Mock analysis: Flat multi-story brick facade with clear street frontage and sidewalk access.",
            raw_response={"mock": True, "image": str(image_path.name)},
        )
