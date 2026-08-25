import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Brain,
  Shield,
  Layers,
  MapPin,
  Maximize2,
  FileText,
  X,
  Gauge,
} from 'lucide-react';
import {
  triggerVisionAnalysis,
  fetchAnalyzedCandidates,
  fetchAnalysisStats,
  subscribeToJobEvents,
  fetchJob,
} from '../services/api';

export default function VisionAnalysisPanel({ theme, onAnalysisFinished }) {
  const [candidates, setCandidates] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [provider, setProvider] = useState('local_vlm');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cList, s] = await Promise.all([
        fetchAnalyzedCandidates(30),
        fetchAnalysisStats(),
      ]);
      setCandidates(cList);
      setStats(s);
    } catch (e) {
      console.error('Failed to load vision analysis data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const jobData = await triggerVisionAnalysis({
        provider: provider,
      });

      const jobId = jobData.job_id;
      setActiveJob(jobData);

      const unsubscribe = subscribeToJobEvents(
        jobId,
        (evt) => {
          setActiveJob((prev) => ({
            ...(prev || {}),
            status: evt.status || prev?.status,
            progress: evt.progress !== undefined ? evt.progress : prev?.progress,
            step_name: evt.step_name || prev?.step_name,
            message: evt.message || prev?.message,
          }));

          if (evt.status === 'completed' || evt.status === 'failed') {
            setIsAnalyzing(false);
            loadData();
            if (onAnalysisFinished) onAnalysisFinished();
            unsubscribe();
          }
        },
        () => {}
      );

      const interval = setInterval(async () => {
        try {
          const fresh = await fetchJob(jobId);
          setActiveJob(fresh);
          if (fresh.status === 'completed' || fresh.status === 'failed') {
            clearInterval(interval);
            setIsAnalyzing(false);
            loadData();
            if (onAnalysisFinished) onAnalysisFinished();
          }
        } catch (e) {
          clearInterval(interval);
        }
      }, 800);

    } catch (e) {
      console.error('Vision analysis failed:', e);
      alert(`Analysis Error: ${e.message}`);
      setIsAnalyzing(false);
    }
  };

  const getMaterialIcon = (mat) => {
    switch (mat?.toLowerCase()) {
      case 'brick': return '🧱';
      case 'concrete': return '🏢';
      case 'stucco': return '🏛️';
      case 'metal': return '🏗️';
      default: return '🧱';
    }
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            <Eye size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Phase 7: Detailed Vision Analysis (Local VLM)
              </h2>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '20px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}>
                Zero Token Cost (Local Engine)
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Structured attribute extraction: surface quality, blankness, obstructions, size class, and material analysis
            </p>
          </div>
        </div>

        {/* Action Trigger */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className="btn-primary"
            style={{
              background: 'linear-gradient(135deg, #0284c7, #3b82f6)',
              padding: '8px 16px',
            }}
          >
            {isAnalyzing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Analyzing Candidates...</span>
              </>
            ) : (
              <>
                <Brain size={16} />
                <span>Run Detailed Vision Analysis</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Analysis Telemetry Cards */}
      {stats && stats.total_analyzed > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}>
          <div style={{
            background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>ANALYZED WALLS</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8', margin: '4px 0 0 0' }}>
              {stats.total_analyzed} Candidates
            </div>
          </div>

          <div style={{
            background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>AVG BLANKNESS</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981', margin: '4px 0 0 0' }}>
              {stats.avg_blankness_pct}% Unobstructed
            </div>
          </div>

          <div style={{
            background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>AVG SURFACE QUALITY</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#a78bfa', margin: '4px 0 0 0' }}>
              {stats.avg_quality_pct}% Paintability
            </div>
          </div>

          <div style={{
            background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>ARTWORK / GRAFFITI</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f472b6', margin: '4px 0 0 0' }}>
              {stats.artwork_detected_count} Flagged
            </div>
          </div>
        </div>
      )}

      {/* Live Job Progress Banner */}
      {activeJob && (
        <div style={{
          background: 'rgba(56, 189, 248, 0.08)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              {activeJob.status === 'running' && <Loader2 size={16} className="animate-spin" color="#38bdf8" />}
              {activeJob.status === 'completed' && <CheckCircle2 size={16} color="#34d399" />}
              <span>{activeJob.step_name || 'Extracting VLM Attributes'}</span>
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#38bdf8' }}>
              {(activeJob.progress || 0).toFixed(0)}%
            </span>
          </div>

          <div className="progress-bar-bg" style={{ marginBottom: '8px' }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${activeJob.progress || 0}%`,
                background: 'linear-gradient(90deg, #0284c7, #38bdf8)',
              }}
            />
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {activeJob.message}
          </div>
        </div>
      )}

      {/* Analyzed Candidates Grid */}
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Structured Wall Intelligence Dossiers ({candidates.length})
        </h3>
        <button
          onClick={loadData}
          disabled={isLoading}
          style={{
            background: 'none',
            border: 'none',
            color: '#38bdf8',
            fontSize: '0.8rem',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {isLoading ? 'Refreshing...' : 'Refresh Dossiers'}
        </button>
      </div>

      {candidates.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          border: '1px dashed var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-secondary)',
          fontSize: '0.88rem',
        }}>
          <Brain size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto', display: 'block' }} />
          No candidates have completed detailed VLM analysis yet.
          <div style={{ fontSize: '0.78rem', marginTop: '6px', color: 'var(--text-muted)' }}>
            Click <strong>"Run Detailed Vision Analysis"</strong> above to extract paintability attributes, blankness, and obstruction profiles.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
          gap: '16px',
        }}>
          {candidates.map((c) => {
            const attr = c.analysis_json || {};
            return (
              <div
                key={c.id}
                onClick={() => setSelectedCandidate(c)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                }}
              >
                {/* Photo Thumbnail */}
                <div style={{ position: 'relative', width: '100%', height: '170px', background: '#0f172a' }}>
                  <img
                    src={c.primary_view_preview_url || '/placeholder.jpg'}
                    alt={`Candidate ${c.id}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy"
                  />

                  {/* Material & Size Pill */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(8px)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <span>{getMaterialIcon(c.wall_material)}</span>
                    <span style={{ textTransform: 'capitalize' }}>{c.wall_material}</span>
                    <span>&bull;</span>
                    <span style={{ textTransform: 'uppercase' }}>{c.estimated_size}</span>
                  </div>

                  {/* Surface Quality Pill */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'rgba(15, 23, 42, 0.90)',
                    border: '1px solid #38bdf8',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    color: '#38bdf8',
                  }}>
                    {c.wall_score.toFixed(0)}% Quality
                  </div>
                </div>

                {/* Card Content & Metrics */}
                <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  
                  {/* Metric Bars */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                        <span>Blankness:</span>
                        <strong style={{ color: '#10b981' }}>{c.blankness_score.toFixed(0)}%</strong>
                      </div>
                      <div className="progress-bar-bg" style={{ height: '4px' }}>
                        <div className="progress-bar-fill" style={{ width: `${c.blankness_score}%`, background: '#10b981' }} />
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                        <span>Visibility:</span>
                        <strong style={{ color: '#38bdf8' }}>{c.visibility_score.toFixed(0)}%</strong>
                      </div>
                      <div className="progress-bar-bg" style={{ height: '4px' }}>
                        <div className="progress-bar-fill" style={{ width: `${c.visibility_score}%`, background: '#38bdf8' }} />
                      </div>
                    </div>
                  </div>

                  {/* AI Reasoning Quote Box */}
                  <div style={{
                    background: 'var(--bg-subtle, rgba(255, 255, 255, 0.03))',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    fontSize: '0.74rem',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.35',
                    marginBottom: '10px',
                    flex: 1,
                  }}>
                    &ldquo;{c.notes || 'High-potential building surface suitable for mural installation.'}&rdquo;
                  </div>

                  {/* Footer Tag */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                    <span>📍 {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}</span>
                    <span style={{ color: c.existing_artwork ? '#f472b6' : '#34d399', fontWeight: 600 }}>
                      {c.existing_artwork ? '⚠️ Artwork Flagged' : '✅ Clean Canvas'}
                    </span>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Candidate Deep Dive Modal */}
      {selectedCandidate && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
        onClick={() => setSelectedCandidate(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '780px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>VLM Dossier: Candidate #{selectedCandidate.id}</span>
                <span style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  fontSize: '0.78rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}>
                  {getMaterialIcon(selectedCandidate.wall_material)} {selectedCandidate.wall_material?.toUpperCase()}
                </span>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ width: '100%', maxHeight: '380px', background: '#000000', display: 'flex', justifyContent: 'center' }}>
              <img
                src={selectedCandidate.primary_view_preview_url}
                alt="Primary Perspective View"
                style={{ maxHeight: '380px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
              />
            </div>

            <div style={{ padding: '20px' }}>
              <h4 style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
                Vision-Language Assessment & Paintability Notes
              </h4>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: '1.45', background: 'var(--bg-subtle)', padding: '12px', borderRadius: '8px', margin: '0 0 16px 0' }}>
                {selectedCandidate.notes}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '14px', fontSize: '0.80rem' }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.70rem' }}>WALL QUALITY</span>
                  <strong style={{ color: '#38bdf8' }}>{selectedCandidate.wall_score}%</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.70rem' }}>BLANKNESS</span>
                  <strong style={{ color: '#10b981' }}>{selectedCandidate.blankness_score}%</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.70rem' }}>VISIBILITY</span>
                  <strong style={{ color: '#a78bfa' }}>{selectedCandidate.visibility_score}%</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.70rem' }}>ACCESS CLEARANCE</span>
                  <strong style={{ color: '#f472b6' }}>{selectedCandidate.access_score}%</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
