import React, { useState, useEffect } from 'react';
import {
  Filter,
  CheckCircle2,
  TrendingDown,
  Layers,
  MapPin,
  Compass,
  Sliders,
  DollarSign,
  Loader2,
  Sparkles,
  Eye,
  X,
  Target,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import {
  triggerCandidateReduction,
  fetchCandidates,
  fetchCandidateStats,
  fetchCandidateDetail,
  subscribeToJobEvents,
  fetchJob,
} from '../services/api';

const IMG_PLACEHOLDER = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'><rect width='200' height='150' fill='%23111827'/><text x='50%25' y='50%25' font-family='sans-serif' font-size='13' fill='%23475569' text-anchor='middle' dy='.3em'>No Image</text></svg>`;

export default function CandidateReductionPanel({ theme, onReductionFinished }) {
  const [candidates, setCandidates] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReducing, setIsReducing] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [minScore, setMinScore] = useState(0.50);
  const [topPercentile, setTopPercentile] = useState(0.20);
  const [clusterDistance, setClusterDistance] = useState(15.0);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [candidateDetail, setCandidateDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cList, s] = await Promise.all([
        fetchCandidates(40, 0),
        fetchCandidateStats(),
      ]);
      setCandidates(cList);
      setStats(s);
    } catch (e) {
      console.error('Failed to load candidate reduction data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenDetail = async (cand) => {
    setSelectedCandidate(cand);
    setLoadingDetail(true);
    try {
      const detail = await fetchCandidateDetail(cand.id);
      setCandidateDetail(detail);
    } catch (e) {
      console.error('Failed to load candidate detail:', e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleRunReduction = async () => {
    setIsReducing(true);
    try {
      const jobData = await triggerCandidateReduction({
        min_score: Number(minScore),
        top_percentile: Number(topPercentile),
        cluster_distance_meters: Number(clusterDistance),
        max_candidates: 50,
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
            setIsReducing(false);
            loadData();
            if (onReductionFinished) onReductionFinished();
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
            setIsReducing(false);
            loadData();
            if (onReductionFinished) onReductionFinished();
          }
        } catch (e) {
          clearInterval(interval);
        }
      }, 800);

    } catch (e) {
      console.error('Candidate reduction failed:', e);
      alert(`Reduction Error: ${e.message}`);
      setIsReducing(false);
    }
  };

  const getCompassDirection = (deg) => {
    if (deg === null || deg === undefined) return '0° N';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(deg / 45) % 8;
    return `${deg.toFixed(0)}° ${directions[idx]}`;
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(236, 72, 153, 0.15)', color: '#ec4899' }}>
            <Filter size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Phase 6: Candidate Reduction & Promotion
              </h2>
              {stats && (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '20px',
                  background: 'rgba(236, 72, 153, 0.15)',
                  color: '#f472b6',
                  border: '1px solid rgba(236, 72, 153, 0.3)',
                }}>
                  {stats.promoted_candidates} Promoted Wall Candidates
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Spatial clustering (15m radius), score cutoff, noise elimination, and primary view assignment
            </p>
          </div>
        </div>

        {/* Cost & Noise Savings */}
        {stats && (
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Noise Reduction: <strong style={{ color: '#ec4899' }}>{stats.noise_reduction_pct}%</strong>
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              API Calls Avoided: <strong style={{ color: '#10b981' }}>{stats.vlm_api_calls_saved}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Funnel Telemetry Cards */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}>
          <div style={{
            background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>1. ROAD SAMPLING</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 0 0' }}>
              {stats.total_geodata_points} Points
            </div>
          </div>

          <div style={{
            background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>2. STREET PHOTOS</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8', margin: '4px 0 0 0' }}>
              {stats.total_imagery_photos} Images
            </div>
          </div>

          <div style={{
            background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>3. PERSPECTIVE VIEWS</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#a78bfa', margin: '4px 0 0 0' }}>
              {stats.total_perspective_views} Slices
            </div>
          </div>

          <div style={{
            background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>4. CLIP RANKED</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981', margin: '4px 0 0 0' }}>
              {stats.total_clip_ranked} Scored
            </div>
          </div>

          <div style={{
            background: 'rgba(236, 72, 153, 0.08)',
            border: '1px solid rgba(236, 72, 153, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.72rem', color: '#f472b6', fontWeight: 700 }}>5. PROMOTED WALLS</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f472b6', margin: '4px 0 0 0' }}>
              {stats.promoted_candidates} Walls
            </div>
          </div>
        </div>
      )}

      {/* Control Panel: Thresholds, Clustering Radius, Action Button */}
      <div style={{
        background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        marginBottom: '18px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '18px',
        alignItems: 'center',
      }}>
        
        {/* Score Threshold */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Score Cutoff:</span>
            <strong style={{ color: '#ec4899' }}>{(minScore * 100).toFixed(0)}%</strong>
          </div>
          <input
            type="range"
            min="0.30"
            max="0.80"
            step="0.05"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#ec4899', cursor: 'pointer' }}
          />
        </div>

        {/* Top Percentile */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Top Percentile:</span>
            <strong style={{ color: '#38bdf8' }}>Top {(topPercentile * 100).toFixed(0)}%</strong>
          </div>
          <select
            value={topPercentile}
            onChange={(e) => setTopPercentile(Number(e.target.value))}
            style={{
              width: '100%',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 10px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="0.10">Top 10% (Strict)</option>
            <option value="0.20">Top 20% (Balanced)</option>
            <option value="0.30">Top 30% (Permissive)</option>
          </select>
        </div>

        {/* Spatial Radius */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Cluster Radius:</span>
            <strong style={{ color: '#a78bfa' }}>{clusterDistance}m</strong>
          </div>
          <input
            type="range"
            min="10"
            max="35"
            step="5"
            value={clusterDistance}
            onChange={(e) => setClusterDistance(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#a78bfa', cursor: 'pointer' }}
          />
        </div>

        {/* Action Button */}
        <div>
          <button
            onClick={handleRunReduction}
            disabled={isReducing}
            className="btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
            }}
          >
            {isReducing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Clustering & Promoting...</span>
              </>
            ) : (
              <>
                <Filter size={16} />
                <span>Run Candidate Reduction</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* Live Job Progress Banner */}
      {activeJob && (
        <div style={{
          background: 'rgba(236, 72, 153, 0.08)',
          border: '1px solid rgba(236, 72, 153, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              {activeJob.status === 'running' && <Loader2 size={16} className="animate-spin" color="#ec4899" />}
              {activeJob.status === 'completed' && <CheckCircle2 size={16} color="#34d399" />}
              <span>{activeJob.step_name || 'Processing Candidate Reduction'}</span>
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ec4899' }}>
              {(activeJob.progress || 0).toFixed(0)}%
            </span>
          </div>

          <div className="progress-bar-bg" style={{ marginBottom: '8px' }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${activeJob.progress || 0}%`,
                background: 'linear-gradient(90deg, #ec4899, #8b5cf6)',
              }}
            />
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {activeJob.message}
          </div>
        </div>
      )}

      {/* Promoted Candidates Grid */}
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Promoted Mural Wall Candidates ({candidates.length})
        </h3>
        <button
          onClick={loadData}
          disabled={isLoading}
          style={{
            background: 'none',
            border: 'none',
            color: '#ec4899',
            fontSize: '0.8rem',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {isLoading ? 'Refreshing...' : 'Refresh Candidates'}
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
          <Layers size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto', display: 'block' }} />
          No promoted wall candidates yet.
          <div style={{ fontSize: '0.78rem', marginTop: '6px', color: 'var(--text-muted)' }}>
            Click <strong>"Run Candidate Reduction"</strong> above to cluster perspective views into distinct physical wall candidate entities.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '14px',
        }}>
          {candidates.map((c, idx) => (
            <div
              key={c.id}
              onClick={() => handleOpenDetail(c)}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.borderColor = 'rgba(236, 72, 153, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }}
            >
              {/* Image Preview Container */}
              <div style={{ position: 'relative', width: '100%', height: '160px', background: '#0f172a' }}>
                <img
                  src={c.primary_view_preview_url || '/placeholder.jpg'}
                  alt={`Candidate ${c.id}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  loading="lazy"
                  onError={e => { e.currentTarget.src = IMG_PLACEHOLDER; }}
                />

                {/* Candidate Badge */}
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
                  Wall #{c.id}
                </div>

                {/* Overall Score Pill */}
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  background: 'rgba(15, 23, 42, 0.90)',
                  border: '1px solid #ec4899',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  color: '#f472b6',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <Target size={12} />
                  <span>{c.overall_score.toFixed(1)}</span>
                </div>

                {/* Perspective View Count Tag */}
                <div style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '8px',
                  background: 'rgba(139, 92, 246, 0.85)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#ffffff',
                }}>
                  {c.view_count} {c.view_count === 1 ? 'Angle' : 'Angles'}
                </div>
              </div>

              {/* Card Body */}
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  <MapPin size={12} color="#38bdf8" />
                  <span>{c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                  <span>Size: <strong>{c.estimated_size.toUpperCase()}</strong></span>
                  <span style={{ textTransform: 'capitalize' }}>{c.wall_material}</span>
                </div>
              </div>
            </div>
          ))}
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
        onClick={() => { setSelectedCandidate(null); setCandidateDetail(null); }}
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
                <span>Physical Wall Candidate #{selectedCandidate.id}</span>
                <span style={{
                  background: 'rgba(236, 72, 153, 0.15)',
                  color: '#f472b6',
                  fontSize: '0.78rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid rgba(236, 72, 153, 0.3)',
                }}>
                  Score: {selectedCandidate.overall_score.toFixed(1)} / 100
                </span>
              </div>
              <button
                onClick={() => { setSelectedCandidate(null); setCandidateDetail(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Primary View Image */}
            <div style={{ width: '100%', maxHeight: '380px', background: '#000000', display: 'flex', justifyContent: 'center' }}>
              <img
                src={selectedCandidate.primary_view_preview_url}
                alt="Primary Perspective View"
                style={{ maxHeight: '380px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
                onError={e => { e.currentTarget.src = IMG_PLACEHOLDER; }}
                />
            </div>

            {/* Sibling Directional Perspectives Filmstrip */}
            {candidateDetail?.views && candidateDetail.views.length > 1 && (
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Associated Multi-Angle Perspective Views ({candidateDetail.views.length})
                </div>
                <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {candidateDetail.views.map((v) => (
                    <div key={v.id} style={{
                      minWidth: '120px',
                      background: 'var(--bg-subtle, rgba(255,255,255,0.03))',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      border: v.is_primary ? '2px solid #ec4899' : '1px solid var(--border-subtle)',
                    }}>
                      <img src={v.preview_url} alt="view" style={{ width: '120px', height: '80px', objectFit: 'cover' }}   onError={e => { e.currentTarget.src = IMG_PLACEHOLDER; }}
                />
                      <div style={{ padding: '4px 6px', fontSize: '0.68rem', textAlign: 'center' }}>
                        <strong style={{ color: '#38bdf8' }}>{getCompassDirection(v.view_heading)}</strong>
                        {v.is_primary && <span style={{ color: '#ec4899', display: 'block', fontWeight: 700 }}>Primary</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Telemetry Details */}
            <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px', fontSize: '0.82rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>WALL SCORE</span>
                <strong style={{ color: '#ec4899' }}>{selectedCandidate.wall_score} / 100</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>GPS COORDINATES</span>
                <strong style={{ color: '#38bdf8' }}>{selectedCandidate.latitude.toFixed(5)}, {selectedCandidate.longitude.toFixed(5)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>ESTIMATED SIZE</span>
                <strong style={{ color: 'var(--text-primary)', textTransform: 'uppercase' }}>{selectedCandidate.estimated_size}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>WALL MATERIAL</span>
                <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{selectedCandidate.wall_material}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
