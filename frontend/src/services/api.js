const API_BASE = '/api';

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return (await res.json()).data;
}

export async function fetchConfig() {
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) throw new Error('Failed to fetch config');
  return (await res.json()).data;
}

export async function fetchCacheStats() {
  const res = await fetch(`${API_BASE}/cache/stats`);
  if (!res.ok) throw new Error('Failed to fetch cache stats');
  return (await res.json()).data;
}

export async function clearCache() {
  const res = await fetch(`${API_BASE}/cache/clear`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to clear cache');
  return (await res.json()).data;
}

export async function triggerDryRun(polygon = null) {
  const res = await fetch(`${API_BASE}/pipeline/dry-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ polygon_geojson: polygon }),
  });
  if (!res.ok) throw new Error('Failed to trigger dry-run');
  return (await res.json()).data;
}

export async function fetchJobs(limit = 20) {
  const res = await fetch(`${API_BASE}/jobs?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch jobs');
  return (await res.json()).data;
}

export async function fetchJob(jobId) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`);
  if (!res.ok) throw new Error(`Failed to fetch job ${jobId}`);
  return (await res.json()).data;
}

export async function extractGeodata(payload) {
  const res = await fetch(`${API_BASE}/geodata/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Extraction failed' }));
    throw new Error(err.detail || 'Geodata extraction failed');
  }
  return (await res.json()).data;
}

export async function createSearchArea(payload) {
  const res = await fetch(`${API_BASE}/search-areas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save search area');
  return (await res.json()).data;
}

export async function fetchSearchAreas() {
  const res = await fetch(`${API_BASE}/search-areas`);
  if (!res.ok) throw new Error('Failed to fetch search areas');
  return (await res.json()).data;
}

export async function triggerImageryIngest(payload) {
  const res = await fetch(`${API_BASE}/imagery/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Ingestion failed' }));
    throw new Error(err.detail || 'Imagery ingestion failed');
  }
  return (await res.json()).data;
}

export async function fetchImageryList(limit = 40, offset = 0) {
  const res = await fetch(`${API_BASE}/imagery?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error('Failed to fetch imagery list');
  return (await res.json()).data;
}

export async function fetchImageryStats() {
  const res = await fetch(`${API_BASE}/imagery/stats`);
  if (!res.ok) throw new Error('Failed to fetch imagery stats');
  return (await res.json()).data;
}

export async function triggerViewGeneration(payload) {
  const res = await fetch(`${API_BASE}/views/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'View generation failed' }));
    throw new Error(err.detail || 'View generation failed');
  }
  return (await res.json()).data;
}

export async function fetchCandidateViews(limit = 40, offset = 0, is_sliced = null) {
  let url = `${API_BASE}/views?limit=${limit}&offset=${offset}`;
  if (is_sliced !== null) url += `&is_sliced=${is_sliced}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch candidate views');
  return (await res.json()).data;
}

export async function fetchViewStats() {
  const res = await fetch(`${API_BASE}/views/stats`);
  if (!res.ok) throw new Error('Failed to fetch view stats');
  return (await res.json()).data;
}

export async function triggerVisionRanking(payload) {
  const res = await fetch(`${API_BASE}/ranking/rank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Ranking failed' }));
    throw new Error(err.detail || 'Vision ranking failed');
  }
  return (await res.json()).data;
}

export async function fetchRankingPrompts() {
  const res = await fetch(`${API_BASE}/ranking/prompts`);
  if (!res.ok) throw new Error('Failed to fetch ranking prompts');
  return (await res.json()).data;
}

export async function fetchTopRankedViews(limit = 30, minScore = 0.0) {
  const res = await fetch(`${API_BASE}/ranking/top?limit=${limit}&min_score=${minScore}`);
  if (!res.ok) throw new Error('Failed to fetch top ranked views');
  return (await res.json()).data;
}

export async function fetchRankingStats() {
  const res = await fetch(`${API_BASE}/ranking/stats`);
  if (!res.ok) throw new Error('Failed to fetch ranking stats');
  return (await res.json()).data;
}

export async function triggerCandidateReduction(payload) {
  const res = await fetch(`${API_BASE}/candidates/reduce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Reduction failed' }));
    throw new Error(err.detail || 'Candidate reduction failed');
  }
  return (await res.json()).data;
}

export async function fetchCandidates(limit = 30, offset = 0, minScore = 0.0) {
  const res = await fetch(`${API_BASE}/candidates?limit=${limit}&offset=${offset}&min_score=${minScore}`);
  if (!res.ok) throw new Error('Failed to fetch candidates');
  return (await res.json()).data;
}

export async function fetchCandidateDetail(candidateId) {
  const res = await fetch(`${API_BASE}/candidates/${candidateId}`);
  if (!res.ok) throw new Error(`Failed to fetch candidate ${candidateId}`);
  return (await res.json()).data;
}

export async function fetchCandidateStats() {
  const res = await fetch(`${API_BASE}/candidates/stats`);
  if (!res.ok) throw new Error('Failed to fetch candidate stats');
  return (await res.json()).data;
}

export async function triggerVisionAnalysis(payload = { provider: 'local_vlm' }) {
  const res = await fetch(`${API_BASE}/analysis/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Analysis failed' }));
    throw new Error(err.detail || 'Vision analysis failed');
  }
  return (await res.json()).data;
}

export async function fetchAnalyzedCandidates(limit = 30) {
  const res = await fetch(`${API_BASE}/analysis/candidates?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch analyzed candidates');
  return (await res.json()).data;
}

export async function fetchAnalysisStats() {
  const res = await fetch(`${API_BASE}/analysis/stats`);
  if (!res.ok) throw new Error('Failed to fetch analysis stats');
  return (await res.json()).data;
}

export async function triggerCandidateVerification(payload = { model: 'gpt-4o-mini' }) {
  const res = await fetch(`${API_BASE}/verification/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Verification failed' }));
    throw new Error(err.detail || 'Verification failed');
  }
  return (await res.json()).data;
}

export async function fetchVerificationStatus() {
  const res = await fetch(`${API_BASE}/verification/status`);
  if (!res.ok) throw new Error('Failed to fetch verification status');
  return (await res.json()).data;
}

export async function fetchVerifiedCandidates(limit = 30) {
  const res = await fetch(`${API_BASE}/verification/candidates?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch verified candidates');
  return (await res.json()).data;
}

export async function fetchScoringWeights() {
  const res = await fetch(`${API_BASE}/scoring/weights`);
  if (!res.ok) throw new Error('Failed to fetch scoring weights');
  return (await res.json()).data;
}

export async function updateScoringWeights(weights) {
  const res = await fetch(`${API_BASE}/scoring/weights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(weights),
  });
  if (!res.ok) throw new Error('Failed to update scoring weights');
  return (await res.json()).data;
}

export async function triggerScoreRecalculation(payload = {}) {
  const res = await fetch(`${API_BASE}/scoring/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Recalculation failed' }));
    throw new Error(err.detail || 'Score recalculation failed');
  }
  return (await res.json()).data;
}

export async function fetchScoringLeaderboard(limit = 30, offset = 0) {
  const res = await fetch(`${API_BASE}/scoring/leaderboard?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error('Failed to fetch scoring leaderboard');
  return (await res.json()).data;
}

export async function fetchScoringStats() {
  const res = await fetch(`${API_BASE}/scoring/stats`);
  if (!res.ok) throw new Error('Failed to fetch scoring stats');
  return (await res.json()).data;
}

export async function triggerDeduplication(payload = {}) {
  const res = await fetch(`${API_BASE}/deduplication/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Deduplication failed' }));
    throw new Error(err.detail || 'Deduplication failed');
  }
  return (await res.json()).data;
}

export async function fetchClusteredWalls(limit = 30, offset = 0) {
  const res = await fetch(`${API_BASE}/deduplication/clusters?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error('Failed to fetch clustered walls');
  return (await res.json()).data;
}

export async function fetchDeduplicationStats() {
  const res = await fetch(`${API_BASE}/deduplication/stats`);
  if (!res.ok) throw new Error('Failed to fetch deduplication stats');
  return (await res.json()).data;
}

export async function searchCandidates(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== 'ALL') {
      query.append(k, v);
    }
  });
  const res = await fetch(`${API_BASE}/export/search?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to search candidates');
  return (await res.json()).data;
}

export async function fetchExecutiveDossier(minScore = 0.0) {
  const res = await fetch(`${API_BASE}/export/dossier?min_score=${minScore}`);
  if (!res.ok) throw new Error('Failed to fetch executive dossier');
  return (await res.json()).data;
}

export function getExportCsvUrl(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== 'ALL') {
      query.append(k, v);
    }
  });
  return `${API_BASE}/export/csv?${query.toString()}`;
}

export function getExportGeoJsonUrl(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== 'ALL') {
      query.append(k, v);
    }
  });
  return `${API_BASE}/export/geojson?${query.toString()}`;
}

export async function runModelBenchmark(payload = { models: ['openclip', 'siglip2'], sample_limit: 50 }) {
  const res = await fetch(`${API_BASE}/benchmark/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to start benchmark' }));
    throw new Error(err.detail || 'Failed to start benchmark');
  }
  return (await res.json()).data;
}

export async function fetchLatestBenchmark() {
  const res = await fetch(`${API_BASE}/benchmark/latest`);
  if (!res.ok) throw new Error('Failed to fetch benchmark report');
  return (await res.json()).data;
}

export async function fetchBenchmarkModels() {
  const res = await fetch(`${API_BASE}/benchmark/models`);
  if (!res.ok) throw new Error('Failed to fetch benchmark models');
  return (await res.json()).data;
}

export function subscribeToJobEvents(jobId, onMessage, onError) {
  const eventSource = new EventSource(`${API_BASE}/jobs/${jobId}/events`);
  
  eventSource.onmessage = (event) => {
    try {
      let raw = event.data;
      if (typeof raw === 'string' && raw.startsWith('data: ')) {
        raw = raw.replace(/^data:\s*/, '');
      }
      const data = JSON.parse(raw);
      onMessage(data);
    } catch (e) {
      console.error('Error parsing SSE event:', e, event.data);
    }
  };

  eventSource.onerror = (err) => {
    if (onError) onError(err);
    eventSource.close();
  };

  return () => eventSource.close();
}
