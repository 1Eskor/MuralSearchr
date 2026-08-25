import json
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app


@pytest.mark.asyncio
async def test_export_api_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Search Endpoint
        s_res = await client.get("/api/export/search?min_score=60.0")
        assert s_res.status_code == 200
        s_data = s_res.json()
        assert s_data["success"] is True
        assert isinstance(s_data["data"], list)

        # CSV Export
        csv_res = await client.get("/api/export/csv")
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.headers["content-type"]
        assert "candidate_id,latitude,longitude" in csv_res.text

        # GeoJSON Export
        geo_res = await client.get("/api/export/geojson")
        assert geo_res.status_code == 200
        geo_data = geo_res.json()
        assert geo_data["type"] == "FeatureCollection"
        assert "features" in geo_data

        # Executive Dossier Export
        d_res = await client.get("/api/export/dossier")
        assert d_res.status_code == 200
        d_data = d_res.json()["data"]
        assert "summary_metrics" in d_data
        assert "top_recommended_walls" in d_data
