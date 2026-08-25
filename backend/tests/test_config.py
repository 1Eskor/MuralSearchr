import pytest
from backend.app.core.config import Settings


def test_settings_initialization():
    settings = Settings()
    assert settings.APP_NAME == "Mural Search"
    assert settings.PORT == 8000
    assert settings.detected_device in ("cpu", "mps", "cuda")


def test_scoring_weights_normalized():
    settings = Settings(
        WEIGHT_WALL=0.30,
        WEIGHT_BLANKNESS=0.25,
        WEIGHT_VISIBILITY=0.20,
        WEIGHT_ACCESSIBILITY=0.15,
        WEIGHT_CONFIDENCE=0.10,
    )
    weights = settings.scoring_weights
    total = sum(weights.values())
    assert pytest.approx(total, 0.001) == 1.0
    assert weights["wall"] == 0.30
    assert weights["blankness"] == 0.25
    assert weights["visibility"] == 0.20
    assert weights["accessibility"] == 0.15
    assert weights["confidence"] == 0.10


def test_cache_dir_resolution(tmp_path):
    settings = Settings(CACHE_DIR=tmp_path / "custom_cache")
    assert settings.CACHE_DIR.is_absolute()
