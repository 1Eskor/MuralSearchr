import React, { useState, useEffect } from 'react';
import {
  Zap,
  CheckCircle2,
  XCircle,
  BarChart3,
  Sliders,
  Play,
  Loader2,
  Sparkles,
  Layers,
  Compass,
  Tag,
  Cpu,
  X,
  Target,
} from 'lucide-react';
import {
  triggerVisionRanking,
  fetchRankingPrompts,
  fetchTopRankedViews,
  fetchRankingStats,
  subscribeToJobEvents,
  fetchJob,
} from '../services/api';

export default function VisionRankerPanel({ theme, onRankingFinished }) {
  const [topViews, setTopViews] = useState([]);
  const [prompts, setPrompts] = useState(null);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRanking, setIsRanking] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [batchSize, setBatchSize] = useState(16);
  const [minFilterScore, setMinFilterScore] = useState(0.0);
  const [selectedView, setSelectedView] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [vList, p, s] = await Promise.all([
        fetchTopRankedViews(36, minFilterScore),
        fetchRankingPrompts(),
        fetchRankingStats(),
      ]);
      setTopViews(vList);
      setPrompts(p);
      setStats(s);
    } catch (e) {
      console.error('Failed to load ranking data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [minFilterScore]);

  const handleRunRanking = async () => {
    setIsRanking(true);
    try {
      const jobData = await triggerVisionRanking({
        provider: 'openclip',
        batch_size: Number(batchSize),
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
            setIsRanking(false);
            loadData();
            if (onRankingFinished) onRankingFinished();
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
            setIsRanking(false);
            loadData();
            if (onRankingFinished) onRankingFinished();
          }
        } catch (e) {
          clearInterval(interval);
        }
      }, 800);

    } catch (e) {
      console.error('Ranking failed:', e);
      alert(`Ranking Error: ${e.message}`);
      setIsRanking(false);
    }
  };

  const getCompassDirection = (deg) => {
    if (deg === null || deg === undefined) return '0° N';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(deg / 45) % 8;
    return `${deg.toFixed(0)}° ${directions[idx]}`;
  };

  const getScoreColor = (score) => {
    if (score >= 0.75) return '#10b981'; // vibrant green
    if (score >= 0.50) return '#06b6d4'; // cyan
    if (score >= 0.30) return '#f59e0b'; // amber
    return '#f43f5e'; // rose/red
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            <Zap size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Phase 5: Local CLIP / SigLIP Vision Ranking
              </h2>
              {stats && (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '20px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <Cpu size={11} /> {stats.model_name} ({stats.device})
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Zero-token local prompt ensemble scoring (blank walls vs trees/traffic) to filter top candidate views
            </p>
          </div>
        </div>

        {/* Stats Pill */}
        {stats && (
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Pass Rate: <strong style={{ color: '#34d399' }}>{stats.pass_rate_pct}%</strong> ({stats.passed_count}/{stats.total_ranked_views})
            </span>
          </div>
        )}
      </div>

      {/* Prompt Ensembles Preview */}
      {prompts && (
        <div style={{
          background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 18px',
          marginBottom: '18px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        }}>
          <div>
            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#10b981', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <CheckCircle2 size={13} /> POSITIVE PROMPT ENSEMBLES (Target Surfaces)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {prompts.positive_prompts.map((p, idx) => (
                <span key={idx} style={{
                  fontSize: '0.72rem',
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '6px',
                  padding: '2px 8px',
                }}>
                  {p}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#f43f5e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <XCircle size={13} /> NEGATIVE PROMPT ENSEMBLES (Noise Rejection)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {prompts.negative_prompts.map((p, idx) => (
                <span key={idx} style={{
                  fontSize: '0.72rem',
                  background: 'rgba(244, 63, 94, 0.12)',
                  color: '#fda4af',
                  border: '1px solid rgba(244, 63, 94, 0.25)',
                  borderRadius: '6px',
                  padding: '2px 8px',
                }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Control Panel: Batch Size, Min Score Filter, Action Button */}
      <div style={{
        background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        marginBottom: '18px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '18px',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Inference Batch Size:</span>
            <strong style={{ color: '#10b981' }}>{batchSize} views/batch</strong>
          </div>
          <input
            type="range"
            min="8"
            max="32"
            step="8"
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Filter Minimum Score:</span>
            <strong style={{ color: '#38bdf8' }}>{(minFilterScore * 100).toFixed(0)}%</strong>
          </div>
          <input
            type="range"
            min="0"
            max="0.8"
            step="0.1"
            value={minFilterScore}
            onChange={(e) => setMinFilterScore(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
          />
        </div>

        <div>
          <button
            onClick={handleRunRanking}
            disabled={isRanking}
            className="btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #10b981, #06b6d4)',
            }}
          >
            {isRanking ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Running Inference...</span>
              </>
            ) : (
              <>
                <Target size={16} />
                <span>Run Local CLIP Ranking</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Job Progress Banner */}
      {activeJob && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              {activeJob.status === 'running' && <Loader2 size={16} className="animate-spin" color="#10b981" />}
              {activeJob.status === 'completed' && <CheckCircle2 size={16} color="#34d399" />}
              <span>{activeJob.step_name || 'Processing Vision Inference'}</span>
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#10b981' }}>
              {(activeJob.progress || 0).toFixed(0)}%
            </span>
          </div>

          <div className="progress-bar-bg" style={{ marginBottom: '8px' }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${activeJob.progress || 0}%`,
                background: 'linear-gradient(90deg, #10b981, #06b6d4)',
              }}
            />
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {activeJob.message}
          </div>
        </div>
      )}

      {/* Score Distribution Histogram */}
      {stats?.histogram && (
        <div style={{
          background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '20px',
        }}>
          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <BarChart3 size={15} color="#10b981" /> CLIP Score Distribution Histogram (0.0 to 1.0)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', alignItems: 'flex-end', height: '90px' }}>
            {Object.entries(stats.histogram).map(([bracket, count]) => {
              const maxCount = Math.max(1, ...Object.values(stats.histogram));
              const heightPct = Math.max(12, (count / maxCount) * 100);
              const isHigh = bracket.startsWith('0.6') || bracket.startsWith('0.8');

              return (
                <div key={bracket} style={{ textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: isHigh ? '#34d399' : 'var(--text-secondary)', marginBottom: '4px' }}>
                    {count}
                  </div>
                  <div style={{
                    height: `${heightPct}%`,
                    background: isHigh ? 'linear-gradient(180deg, #10b981, #06b6d4)' : 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px 4px 0 0',
                    transition: 'all 0.3s ease',
                  }} />
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {bracket}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Ranked Views Grid */}
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Top Ranked Candidate Views ({topViews.length})
        </h3>
        <button
          onClick={loadData}
          disabled={isLoading}
          style={{
            background: 'none',
            border: 'none',
            color: '#10b981',
            fontSize: '0.8rem',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {isLoading ? 'Refreshing...' : 'Refresh Ranked Views'}
        </button>
      </div>

      {topViews.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          border: '1px dashed var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-secondary)',
          fontSize: '0.88rem',
        }}>
          <Zap size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto', display: 'block' }} />
          No ranked candidate views yet.
          <div style={{ fontSize: '0.78rem', marginTop: '6px', color: 'var(--text-muted)' }}>
            Click <strong>"Run Local CLIP Ranking"</strong> above to score candidate perspective views against prompt ensembles.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '14px',
        }}>
          {topViews.map((v, index) => {
            const score = v.raw_clip_score || 0.0;
            const scorePct = (score * 100).toFixed(1);
            const scoreColor = getScoreColor(score);

            return (
              <div
                key={v.id}
                onClick={() => setSelectedView(v)}
                style={{
                  background: 'var(--bg-card)',
                  border: `1px solid ${score >= 0.7 ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.borderColor = scoreColor;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = score >= 0.7 ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-subtle)';
                }}
              >
                {/* Image Preview Container */}
                <div style={{ position: 'relative', width: '100%', height: '160px', background: '#0f172a' }}>
                  <img
                    src={v.preview_url}
                    alt={`Ranked view ${v.id}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy"
                  />

                  {/* Rank Rank Badge #1, #2... */}
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
                  }}>
                    #{index + 1}
                  </div>

                  {/* Score Pill */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'rgba(15, 23, 42, 0.90)',
                    border: `1px solid ${scoreColor}`,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    color: scoreColor,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <Target size={12} />
                    <span>{scorePct}%</span>
                  </div>

                  {/* Heading Chip */}
                  <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '8px',
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(8px)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: '#38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}>
                    <Compass size={10} />
                    <span>{getCompassDirection(v.view_heading)}</span>
                  </div>
                </div>

                {/* Card Body */}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>View #{v.id}</span>
                    <span style={{
                      fontWeight: 700,
                      fontSize: '0.68rem',
                      color: v.wall_detected ? '#34d399' : '#fda4af',
                      textTransform: 'uppercase',
                    }}>
                      {v.wall_detected ? 'Wall Passed' : 'Noise Rejected'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                    <span>Source #{v.imagery_id}</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>#{v.file_hash?.substring(0, 8)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedView && (
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
        onClick={() => setSelectedView(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '720px',
              width: '100%',
              overflow: 'hidden',
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
                <span>Ranked Candidate View #{selectedView.id}</span>
                <span style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  fontSize: '0.78rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}>
                  CLIP: {((selectedView.raw_clip_score || 0) * 100).toFixed(1)}% Match
                </span>
              </div>
              <button
                onClick={() => setSelectedView(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ width: '100%', maxHeight: '420px', background: '#000000', display: 'flex', justifyContent: 'center' }}>
              <img
                src={selectedView.preview_url}
                alt="Detailed Ranked View"
                style={{ maxHeight: '420px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
              />
            </div>

            <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px', fontSize: '0.82rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>RAW CLIP SCORE</span>
                <strong style={{ color: getScoreColor(selectedView.raw_clip_score || 0) }}>
                  {((selectedView.raw_clip_score || 0) * 100).toFixed(2)}%
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>COMPASS HEADING</span>
                <strong style={{ color: '#38bdf8' }}>{getCompassDirection(selectedView.view_heading)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>WALL DETECTED</span>
                <strong style={{ color: selectedView.wall_detected ? '#34d399' : '#fda4af' }}>
                  {selectedView.wall_detected ? 'Yes (Pass)' : 'No (Reject)'}
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>CACHE FILE HASH</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#10b981' }}>{selectedView.file_hash?.substring(0, 16)}...</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
