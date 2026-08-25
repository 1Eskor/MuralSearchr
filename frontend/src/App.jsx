import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import SystemStatus from './components/SystemStatus';
import ProviderMatrix from './components/ProviderMatrix';
import MapExplorer from './components/MapExplorer';
import ImageryGallery from './components/ImageryGallery';
import ViewGenerator from './components/ViewGenerator';
import VisionRankerPanel from './components/VisionRankerPanel';
import BenchmarkPanel from './components/BenchmarkPanel';
import CandidateReductionPanel from './components/CandidateReductionPanel';
import VisionAnalysisPanel from './components/VisionAnalysisPanel';
import OpenAIVerificationPanel from './components/OpenAIVerificationPanel';
import ScoringEnginePanel from './components/ScoringEnginePanel';
import DeduplicationPanel from './components/DeduplicationPanel';
import MapProspector from './components/MapProspector';
import SearchExportPanel from './components/SearchExportPanel';
import JobMonitor from './components/JobMonitor';
import CacheInspector from './components/CacheInspector';
import { fetchHealth, fetchConfig, fetchCacheStats } from './services/api';

export default function App() {
  const [health, setHealth] = useState(null);
  const [config, setConfig] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('mural_theme');
    if (saved) return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mural_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const loadData = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const [h, c, cs] = await Promise.all([
        fetchHealth(),
        fetchConfig(),
        fetchCacheStats(),
      ]);
      setHealth(h);
      setConfig(c);
      setCacheStats(cs);
    } catch (e) {
      console.error('Failed to load system telemetry', e);
      setError('Could not connect to backend server. Ensure backend is running on http://127.0.0.1:8000');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        health={health}
        onRefresh={loadData}
        isRefreshing={isRefreshing}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main style={{ flex: 1, maxWidth: '1280px', width: '100%', margin: '0 auto', padding: '28px 24px' }}>
        
        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.12)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 18px',
            color: '#fda4af',
            fontSize: '0.88rem',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        {/* Top Status Cards */}
        <SystemStatus health={health} config={config} cacheStats={cacheStats} />

        {/* Provider Architecture */}
        <ProviderMatrix config={config} />

        {/* Phase 2: Interactive Geographic Search & Map Explorer */}
        <MapExplorer theme={theme} onSearchAreaCreated={loadData} />

        {/* Phase 3: Street-Level Imagery Ingestion & Gallery */}
        <ImageryGallery theme={theme} onImageryUpdated={loadData} />

        {/* Phase 4: Panorama Directional Slicing & Perspective Views */}
        <ViewGenerator theme={theme} onViewCreated={loadData} />

        {/* Phase 5: Local CLIP / SigLIP Vision Ranking */}
        <VisionRankerPanel theme={theme} onRankingFinished={loadData} />

        {/* Vision Model Benchmark: SigLIP 2 vs OpenCLIP */}
        <BenchmarkPanel theme={theme} onBenchmarkFinished={loadData} />

        {/* Phase 6: Candidate Reduction & Spatial Clustering */}
        <CandidateReductionPanel theme={theme} onReductionFinished={loadData} />

        {/* Phase 7: Detailed Vision Analysis (Local VLM) */}
        <VisionAnalysisPanel theme={theme} onAnalysisFinished={loadData} />

        {/* Phase 8: Optional OpenAI Verification Fallback */}
        <OpenAIVerificationPanel theme={theme} onVerificationFinished={loadData} />

        {/* Phase 9: Multi-Criteria Scoring Formula Engine */}
        <ScoringEnginePanel theme={theme} onScoringFinished={loadData} />

        {/* Phase 10: Candidate Deduplication & Spatial View Clustering */}
        <DeduplicationPanel theme={theme} onDeduplicationFinished={loadData} />

        {/* Phase 11: MapLibre Interactive Prospecting UI */}
        <MapProspector theme={theme} onWallSelected={loadData} />

        {/* Phase 12: Search, Filter & Export Studio */}
        <SearchExportPanel theme={theme} />

        {/* Live Job Monitor & Dry-Run Pipeline Simulator */}
        <JobMonitor onPipelineFinish={loadData} />

        {/* Cache Inspector */}
        <CacheInspector stats={cacheStats} onCacheCleared={loadData} />
      </main>

      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '16px 24px',
        textAlign: 'center',
        fontSize: '0.78rem',
        color: 'var(--text-muted)'
      }}>
        Mural Search &bull; Phase 12 Production Complete &bull; Local-First Geospatial Wall Intelligence
      </footer>
    </div>
  );
}
