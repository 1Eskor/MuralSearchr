import React, { useState, useEffect } from 'react';
import {
  Award,
  Sliders,
  TrendingUp,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Zap,
  Target,
  Sparkles,
  Layers,
  MapPin,
  X,
  ChevronRight,
  Info,
} from 'lucide-react';
import {
  fetchScoringWeights,
  updateScoringWeights,
  triggerScoreRecalculation,
  fetchScoringLeaderboard,
  fetchScoringStats,
  subscribeToJobEvents,
  fetchJob,
} from '../services/api';

export default function ScoringEnginePanel({ theme, onScoringFinished }) {
  const [weights, setWeights] = useState({
    wall_quality_weight: 0.30,
    blankness_weight: 0.25,
    visibility_weight: 0.20,
    accessibility_weight: 0.15,
    confidence_weight: 0.10,
    obstruction_penalty_factor: 25.0,
    existing_artwork_penalty: 40.0,
  });
  const [leaderboard, setLeaderboard] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [w, lb, st] = await Promise.all([
        fetchScoringWeights(),
        fetchScoringLeaderboard(40, 0),
        fetchScoringStats(),
      ]);
      setWeights(w);
      setLeaderboard(lb);
      setStats(st);
    } catch (e) {
      console.error('Failed to load scoring engine data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalRawWeight = (
    weights.wall_quality_weight +
    weights.blankness_weight +
    weights.visibility_weight +
    weights.accessibility_weight +
    weights.confidence_weight
  );

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      const jobData = await triggerScoreRecalculation({
        weights: weights,
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
            setIsRecalculating(false);
            loadData();
            if (onScoringFinished) onScoringFinished();
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
            setIsRecalculating(false);
            loadData();
            if (onScoringFinished) onScoringFinished();
          }
        } catch (e) {
          clearInterval(interval);
        }
      }, 800);

    } catch (e) {
      console.error('Recalculation failed:', e);
      alert(`Recalculation Error: ${e.message}`);
      setIsRecalculating(false);
    }
  };

  const handleResetDefaults = () => {
    setWeights({
      wall_quality_weight: 0.30,
      blankness_weight: 0.25,
      visibility_weight: 0.20,
      accessibility_weight: 0.15,
      confidence_weight: 0.10,
      obstruction_penalty_factor: 25.0,
      existing_artwork_penalty: 40.0,
    });
  };

  const getGradeStyle = (grade) => {
    if (grade?.startsWith('A')) return { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: '#10b981' };
    if (grade?.startsWith('B')) return { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: '#0284c7' };
    if (grade?.startsWith('C')) return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: '#d97706' };
    return { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: '#ef4444' };
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
            <Award size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Phase 9: Multi-Criteria Scoring Formula Engine
              </h2>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '20px',
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.3)',
              }}>
                M = 0.30W + 0.25B + 0.20V + 0.15A + 0.10C
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Tune multi-criteria scoring weights in real-time, recalculate composite ratings, and rank prospective walls
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleResetDefaults}
            style={{
              background: 'none',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              padding: '6px 12px',
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <RotateCcw size={12} />
            <span>Reset Weights</span>
          </button>

          <button
            onClick={handleRecalculate}
            disabled={isRecalculating}
            className="btn-primary"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              padding: '8px 16px',
            }}
          >
            {isRecalculating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Re-ranking Candidates...</span>
              </>
            ) : (
              <>
                <Zap size={16} />
                <span>Recalculate Wall Rankings</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Interactive Weights Tuning Panel */}
      <div style={{
        background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sliders size={14} color="#f59e0b" />
            <span>Dynamic Weight Tuner</span>
          </span>
          <span style={{
            fontSize: '0.74rem',
            fontWeight: 700,
            color: Math.abs(totalRawWeight - 1.0) < 0.01 ? '#34d399' : '#fbbf24',
          }}>
            Sum: {(totalRawWeight * 100).toFixed(0)}% (Auto-Normalized)
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
        }}>
          {/* Wall Quality */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>W: Wall Quality:</span>
              <strong style={{ color: '#38bdf8' }}>{(weights.wall_quality_weight * 100).toFixed(0)}%</strong>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.60"
              step="0.05"
              value={weights.wall_quality_weight}
              onChange={(e) => setWeights({ ...weights, wall_quality_weight: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
            />
          </div>

          {/* Canvas Blankness */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>B: Canvas Blankness:</span>
              <strong style={{ color: '#10b981' }}>{(weights.blankness_weight * 100).toFixed(0)}%</strong>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.60"
              step="0.05"
              value={weights.blankness_weight}
              onChange={(e) => setWeights({ ...weights, blankness_weight: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
            />
          </div>

          {/* Visibility */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>V: Street Visibility:</span>
              <strong style={{ color: '#a78bfa' }}>{(weights.visibility_weight * 100).toFixed(0)}%</strong>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.60"
              step="0.05"
              value={weights.visibility_weight}
              onChange={(e) => setWeights({ ...weights, visibility_weight: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#a78bfa', cursor: 'pointer' }}
            />
          </div>

          {/* Accessibility */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>A: Equipment Access:</span>
              <strong style={{ color: '#f472b6' }}>{(weights.accessibility_weight * 100).toFixed(0)}%</strong>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.60"
              step="0.05"
              value={weights.accessibility_weight}
              onChange={(e) => setWeights({ ...weights, accessibility_weight: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#f472b6', cursor: 'pointer' }}
            />
          </div>

          {/* Model Confidence */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>C: Model Confidence:</span>
              <strong style={{ color: '#fbbf24' }}>{(weights.confidence_weight * 100).toFixed(0)}%</strong>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.40"
              step="0.05"
              value={weights.confidence_weight}
              onChange={(e) => setWeights({ ...weights, confidence_weight: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#fbbf24', cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>

      {/* Grade Tier Distribution Cards */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}>
          <div style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: '0.70rem', color: '#34d399', fontWeight: 700 }}>TIER A (90+)</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#34d399', margin: '2px 0 0 0' }}>
              {stats.grade_distribution?.A || 0} Walls
            </div>
          </div>

          <div style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: '0.70rem', color: '#38bdf8', fontWeight: 700 }}>TIER B (80-89)</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8', margin: '2px 0 0 0' }}>
              {stats.grade_distribution?.B || 0} Walls
            </div>
          </div>

          <div style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: '0.70rem', color: '#fbbf24', fontWeight: 700 }}>TIER C (70-79)</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fbbf24', margin: '2px 0 0 0' }}>
              {stats.grade_distribution?.C || 0} Walls
            </div>
          </div>

          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: '0.70rem', color: '#f87171', fontWeight: 700 }}>TIER D / F (&lt;70)</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f87171', margin: '2px 0 0 0' }}>
              {(stats.grade_distribution?.D || 0) + (stats.grade_distribution?.F || 0)} Walls
            </div>
          </div>
        </div>
      )}

      {/* Live Job Progress Banner */}
      {activeJob && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              {activeJob.status === 'running' && <Loader2 size={16} className="animate-spin" color="#f59e0b" />}
              {activeJob.status === 'completed' && <CheckCircle2 size={16} color="#34d399" />}
              <span>{activeJob.step_name || 'Recalculating Multi-Criteria Rankings'}</span>
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b' }}>
              {(activeJob.progress || 0).toFixed(0)}%
            </span>
          </div>

          <div className="progress-bar-bg" style={{ marginBottom: '8px' }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${activeJob.progress || 0}%`,
                background: 'linear-gradient(90deg, #f59e0b, #eab308)',
              }}
            />
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {activeJob.message}
          </div>
        </div>
      )}

      {/* Ranked Mural Leaderboard Grid */}
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Ranked Mural Wall Leaderboard ({leaderboard.length})
        </h3>
        <button
          onClick={loadData}
          disabled={isLoading}
          style={{
            background: 'none',
            border: 'none',
            color: '#f59e0b',
            fontSize: '0.8rem',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {isLoading ? 'Refreshing...' : 'Refresh Leaderboard'}
        </button>
      </div>

      {leaderboard.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          border: '1px dashed var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-secondary)',
          fontSize: '0.88rem',
        }}>
          <Award size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto', display: 'block' }} />
          No ranked wall candidates available.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
          gap: '16px',
        }}>
          {leaderboard.map((c, idx) => {
            const gStyle = getGradeStyle(c.grade);
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
                  e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                }}
              >
                {/* Photo Thumbnail */}
                <div style={{ position: 'relative', width: '100%', height: '160px', background: '#0f172a' }}>
                  <img
                    src={c.primary_view_preview_url || '/placeholder.jpg'}
                    alt={`Candidate ${c.id}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy"
                  />

                  {/* Rank Badge */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(8px)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    color: '#f8fafc',
                  }}>
                    #{idx + 1}
                  </div>

                  {/* Grade Pill */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: gStyle.bg,
                    border: `1px solid ${gStyle.border}`,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    color: gStyle.text,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <span>{c.grade}</span>
                    <span>&bull;</span>
                    <span>{c.overall_score.toFixed(1)}</span>
                  </div>
                </div>

                {/* Card Content & Metrics */}
                <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  
                  {/* Component Breakdown Mini Bars */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.70rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      <span>Quality ({c.wall_score.toFixed(0)})</span>
                      <span>Blank ({c.blankness_score.toFixed(0)})</span>
                      <span>Vis ({c.visibility_score.toFixed(0)})</span>
                      <span>Access ({c.access_score.toFixed(0)})</span>
                    </div>

                    <div className="progress-bar-bg" style={{ height: '6px', display: 'flex', overflow: 'hidden' }}>
                      <div style={{ width: '30%', background: '#38bdf8' }} title="Wall Quality (30%)" />
                      <div style={{ width: '25%', background: '#10b981' }} title="Blankness (25%)" />
                      <div style={{ width: '20%', background: '#a78bfa' }} title="Visibility (20%)" />
                      <div style={{ width: '15%', background: '#f472b6' }} title="Access (15%)" />
                      <div style={{ width: '10%', background: '#fbbf24' }} title="Confidence (10%)" />
                    </div>
                  </div>

                  {/* Material & Size Class */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    <span style={{ textTransform: 'capitalize' }}>🧱 {c.wall_material || 'Masonry'}</span>
                    <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{c.estimated_size}</span>
                  </div>

                  {/* Footer Tag */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.70rem', color: 'var(--text-muted)', marginTop: 'auto' }}>
                    <span>📍 {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}</span>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>View Breakdown &rarr;</span>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Candidate Score Breakdown Modal */}
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
              maxWidth: '740px',
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
                <span>Scoring Breakdown: Wall #{selectedCandidate.id}</span>
                <span style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#fbbf24',
                  fontSize: '0.78rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}>
                  Grade: {selectedCandidate.grade} ({selectedCandidate.overall_score.toFixed(1)} / 100)
                </span>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ width: '100%', maxHeight: '340px', background: '#000000', display: 'flex', justifyContent: 'center' }}>
              <img
                src={selectedCandidate.primary_view_preview_url}
                alt="Primary Perspective View"
                style={{ maxHeight: '340px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
              />
            </div>

            <div style={{ padding: '20px' }}>
              <h4 style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px 0' }}>
                Component Contribution Formula
              </h4>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: '10px',
                marginBottom: '16px',
              }}>
                <div style={{ background: 'var(--bg-subtle)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>WALL QUALITY (30%)</div>
                  <strong style={{ color: '#38bdf8', fontSize: '1rem' }}>{selectedCandidate.wall_score.toFixed(1)}</strong>
                </div>

                <div style={{ background: 'var(--bg-subtle)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>BLANKNESS (25%)</div>
                  <strong style={{ color: '#10b981', fontSize: '1rem' }}>{selectedCandidate.blankness_score.toFixed(1)}</strong>
                </div>

                <div style={{ background: 'var(--bg-subtle)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>VISIBILITY (20%)</div>
                  <strong style={{ color: '#a78bfa', fontSize: '1rem' }}>{selectedCandidate.visibility_score.toFixed(1)}</strong>
                </div>

                <div style={{ background: 'var(--bg-subtle)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>ACCESS (15%)</div>
                  <strong style={{ color: '#f472b6', fontSize: '1rem' }}>{selectedCandidate.access_score.toFixed(1)}</strong>
                </div>

                <div style={{ background: 'var(--bg-subtle)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>CONFIDENCE (10%)</div>
                  <strong style={{ color: '#fbbf24', fontSize: '1rem' }}>{selectedCandidate.confidence_score.toFixed(1)}</strong>
                </div>
              </div>

              {selectedCandidate.notes && (
                <div style={{ background: 'var(--bg-subtle)', padding: '12px', borderRadius: '6px', fontSize: '0.80rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  {selectedCandidate.notes}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
