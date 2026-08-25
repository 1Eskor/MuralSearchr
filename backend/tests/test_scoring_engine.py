import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app
from backend.app.services.scoring import ScoringWeights, compute_composite_score


def test_scoring_weights_normalization():
    w = ScoringWeights(
        wall_quality_weight=0.60,
        blankness_weight=0.50,
        visibility_weight=0.40,
        accessibility_weight=0.30,
        confidence_weight=0.20,
    )
    norm = w.get_normalized()
    total = (
        norm.wall_quality_weight
        + norm.blankness_weight
        + norm.visibility_weight
        + norm.accessibility_weight
        + norm.confidence_weight
    )
    assert abs(total - 1.0) < 0.001


def test_composite_score_computation():
    score, grade, breakdown = compute_composite_score(
        wall_score=95.0,
        blankness_score=90.0,
        visibility_score=85.0,
        access_score=90.0,
        confidence_score=95.0,
        obstructions=0.0,
        existing_artwork=False,
    )

    assert 88.0 <= score <= 95.0
    assert grade in ["A+", "A"]
    assert "wall_quality_component" in breakdown

    # Artwork penalty test
    score_penalized, grade_p, _ = compute_composite_score(
        wall_score=95.0,
        blankness_score=90.0,
        visibility_score=85.0,
        access_score=90.0,
        confidence_score=95.0,
        obstructions=0.2,
        existing_artwork=True,  # -40.0 penalty
    )
    assert score_penalized < score


@pytest.mark.asyncio
async def test_scoring_api_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Get Weights
        w_res = await client.get("/api/scoring/weights")
        assert w_res.status_code == 200
        w_data = w_res.json()["data"]
        assert "wall_quality_weight" in w_data

        # Update Weights
        update_payload = {
            "wall_quality_weight": 0.35,
            "blankness_weight": 0.25,
            "visibility_weight": 0.20,
            "accessibility_weight": 0.10,
            "confidence_weight": 0.10,
            "obstruction_penalty_factor": 25.0,
            "existing_artwork_penalty": 40.0,
        }
        u_res = await client.post("/api/scoring/weights", json=update_payload)
        assert u_res.status_code == 200

        # Trigger Recalculation Job
        r_res = await client.post("/api/scoring/calculate", json={})
        assert r_res.status_code == 200
        assert r_res.json()["data"]["job_id"].startswith("job_")

        # Leaderboard
        l_res = await client.get("/api/scoring/leaderboard?limit=5")
        assert l_res.status_code == 200
        l_data = l_res.json()
        assert l_data["success"] is True
        assert isinstance(l_data["data"], list)

        # Stats
        s_res = await client.get("/api/scoring/stats")
        assert s_res.status_code == 200
        s_data = s_res.json()["data"]
        assert "grade_distribution" in s_data
