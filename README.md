# Mural Search — Local-First Mural Prospecting Engine

A local-first prospecting pipeline that uses open geospatial data (OpenStreetMap) and local vision models (OpenCLIP/SigLIP, local VLM) to discover, rank, score, and map blank exterior building walls suitable for murals.

---

## 🏛️ Architecture Overview

```
providers/
  ├── geodata/      # GeoDataProvider (OSM, Overpass, Mock)
  ├── imagery/      # ImageryProvider (Mapillary, Local, Mock)
  ├── vision/       # VisionRanker (CLIP/SigLIP) & VisionAnalyzer (VLM/OpenAI)
  └── exposure/     # ExposureScoreProvider (Traffic/Transit interface)
```

**Core Principle**: The scoring engine, database, and pipeline are decoupled from specific data/AI providers.

---

## 🚀 Quickstart Guide

### Prerequisites
- Python 3.9+
- Node.js 18+ and npm
- macOS with Apple Silicon Metal (MPS), Linux with NVIDIA CUDA, or CPU fallback

### 1. Backend Setup
```bash
# From workspace root
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# Start backend server
uvicorn backend.app.main:app --reload --port 8000
```
API Documentation is available at: [http://localhost:8000/docs](http://localhost:8000/docs)

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Web Dashboard will be live at: [http://localhost:5173](http://localhost:5173)

### 3. Running Automated Tests
```bash
PYTHONPATH=. ./venv/bin/pytest -v
```

---

## 📋 Scoring Formula
$$M = 0.30W + 0.25B + 0.20V + 0.15A + 0.10C$$
- **$W$**: Wall suitability (30%)
- **$B$**: Blankness (25%)
- **$V$**: Visibility (20%)
- **$A$**: Accessibility (15%)
- **$C$**: Multi-view confidence (10%)

---

## 🗺️ Roadmap & Phases
- [x] **Phase 1: Project Foundation** (Backend, DB, Caching, Job System, Provider Abstractions, Dashboard)
- [x] **Phase 2: Geographic Search** (Polygon selection, OSM road/building extraction, spatial sampling)
- [x] **Phase 3: Imagery Ingestion** (Mapillary API v4 integration, local cache, metadata persistence, photo gallery)
- [x] **Phase 4: Panorama/View Generation** (Equirectangular-to-rectilinear projection, directional slicing, candidate view matrix)
- [x] **Phase 5: Local CLIP/SigLIP Ranking** (Zero-shot prompt ensembles, cosine similarity scoring, cost elimination)
- [x] **Phase 6: Candidate Reduction** (Top-percentile filtering, 15m spatial view clustering, candidate entity promotion)
- [x] **Phase 7: Detailed Vision Analysis** (Local VLM structured paintability attributes, material & obstruction profiling)
- [x] **Phase 8: Optional OpenAI Verification** (GPT-4o-mini second-stage sanity check, consensus scoring, zero-cost simulation mode)
- [x] **Phase 9: Scoring Engine** (Multi-criteria formula $M = 0.30W + 0.25B + 0.20V + 0.15A + 0.10C$, dynamic weights, ranked leaderboard)
- [x] **Phase 10: Deduplication & View Clustering** (Multi-angle view aggregation, canonical physical walls, 360° filmstrip carousels)
- [x] **Phase 11: MapLibre Interactive UI** (Interactive vector map, Grade-coded pins, flyTo camera navigation, slide-out wall drawer)
- [x] **Phase 12: Search & Export** (CSV tabular dataset, RFC 7946 GeoJSON FeatureCollections, Executive Briefing Dossiers)
