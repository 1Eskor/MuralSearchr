from abc import abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from backend.app.providers.base import BaseProvider


class PromptScore(BaseModel):
    prompt: str
    similarity: float


class PromptConfig(BaseModel):
    positive_prompts: List[str] = Field(
        default=[
            "a large blank exterior wall suitable for a mural",
            "plain building facade with clean paintable surface",
            "large flat concrete exterior wall",
            "brick wall on side of commercial building",
        ]
    )
    negative_prompts: List[str] = Field(
        default=[
            "dense green trees and bushes blocking view",
            "busy street with traffic cars and trucks, no wall",
            "modern glass office skyscraper building with windows",
            "residential suburban house with small windows",
        ]
    )
    detection_threshold: float = Field(default=0.45, ge=0.0, le=1.0)


class RankedViewResult(BaseModel):
    view_id: Optional[int] = None
    raw_clip_score: float = 0.0
    wall_detected: bool = True
    details: Optional[Dict[str, Any]] = None


class ImageRankScore(BaseModel):
    image_path: Optional[Path] = None
    image_id: str
    composite_rank: float = 0.0  # 0.0 to 1.0 (positive similarity minus negative penalty)
    raw_score: float = 0.0
    wall_detected: bool = True
    wall_score: float = 0.0
    blank_wall_score: float = 0.0
    building_score: float = 0.0
    obstruction_score: float = 0.0
    confidence: float = 0.0
    breakdown: Optional[Dict[str, Any]] = None
    detailed_scores: Optional[Dict[str, float]] = None


# Alias for backward compatibility
VisionRankResult = ImageRankScore


class WallAttributes(BaseModel):
    """
    Structured wall attributes extracted by Stage 2 Vision-Language Model.
    """
    wall_present: bool = True
    wall_quality: float = Field(default=0.8, ge=0.0, le=1.0)
    blankness: float = Field(default=0.8, ge=0.0, le=1.0)
    visibility: float = Field(default=0.8, ge=0.0, le=1.0)
    accessibility: float = Field(default=0.8, ge=0.0, le=1.0)
    obstructions: float = Field(default=0.2, ge=0.0, le=1.0)
    existing_artwork: bool = False
    size_class: str = "large"  # small, medium, large, very_large
    wall_material: str = "brick"  # brick, concrete, stucco, metal, wood, glass
    obstruction_details: Optional[List[str]] = None
    confidence: float = Field(default=0.85, ge=0.0, le=1.0)
    reason: str = "Large uninterrupted exterior wall with direct ground access."
    raw_response: Optional[Dict[str, Any]] = None


# Alias for backward compatibility
VisionAnalysisResult = WallAttributes


class VisionRanker(BaseProvider):
    """
    Abstract interface for Stage 1 fast embedding ranking (OpenCLIP / SigLIP).
    """

    @abstractmethod
    async def rank_images(
        self,
        image_paths: List[Path],
        positive_prompts: Optional[List[str]] = None,
        negative_prompts: Optional[List[str]] = None,
        batch_size: int = 16,
    ) -> List[ImageRankScore]:
        """
        Compute similarity scores against positive & negative prompts and rank images.
        """
        pass


class VisionAnalyzer(BaseProvider):
    """
    Abstract interface for Stage 2 detailed vision analysis (Local VLM / OpenAI fallback).
    """

    @abstractmethod
    async def analyze_wall(
        self,
        image_path: Path,
        context: Optional[Dict[str, Any]] = None,
    ) -> WallAttributes:
        """
        Extract structured wall suitability attributes from a candidate image.
        """
        pass
