import React, { useState, useEffect } from 'react';
import {
  GitMerge,
  Compass,
  Layers,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Eye,
  Sliders,
  MapPin,
  X,
  ChevronRight,
  Maximize2,
} from 'lucide-react';
import {
  triggerDeduplication,
  fetchClusteredWalls,
  fetchDeduplicationStats,
  subscribeToJobEvents,
  fetchJob,
} from '../services/api';

const IMG_PLACEHOLDER = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'><rect width='200' height='150' fill='%23111827'/><text x='50%25' y='50%25' font-family='sans-serif' font-size='13' fill='%23475569' text-anchor='middle' dy='.3em'>No Image</text></svg>`;

export default function DeduplicationPanel({ theme, onDeduplicationFinished }) {
  const [spatialRadius, setSpatialRadius] = useState(15.0);
  const [visualSim, setVisualSim] = useState(0.90);
  const [clusteredWalls, setClusteredWalls] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [selectedWall, setSelectedWall] = useState(null);
  const [activeViewIdx, setActiveViewIdx] = useState(0);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [walls, st] = await Promise.all([
        fetchClusteredWalls(40, 0),
        fetchDeduplicationStats(),
      ]);
      setClusteredWalls(walls);
      setStats(st);
    } catch (e) {
      console.error('Failed to load deduplication data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRunDeduplication = async () => {
    setIsDeduplicating(true);
    try {
      const jobData = await triggerDeduplication({
        spatial_radius_meters: spatialRadius,
        visual_sim_threshold: visualSim,
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
            setIsDeduplicating(false);
            loadData();
            if (onDeduplicationFinished) onDeduplicationFinished();
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
            setIsDeduplicating(false);
            loadData();
            if (onDeduplicationFinished) onDeduplicationFinished();
          }
        } catch (e) {
          clearInterval(interval);
        }
      }, 800);

    } catch (e) {
      console.error('Deduplication failed:', e);
      alert(`Deduplication Error: ${e.message}`);
      setIsDeduplicating(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(236, 72, 153, 0.15)', color: '#ec4899' }}>
            <GitMerge size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Phase 10: Candidate Deduplication & Spatial View Clustering
              </h2>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '20px',
                background: 'rgba(236, 72, 153, 0.15)',
                color: '#f472b6',
                border: '1px solid rgba(236, 72, 153, 0.3)',
              }}>
                Multi-View Consolidation
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Cluster multi-angle camera passes within physical distance thresholds into canonical walls with 360° view coverage
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleRunDeduplication}
            disabled={isDeduplicating}
            className="btn-primary"
            style={{
              background: 'linear-gradient(135deg, #ec4899, #be185d)',
              padding: '8px 16px',
            }}
          >
            {isDeduplicating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Clustering Wall Perspectives...</span>
              </>
            ) : (
              <>
                <GitMerge size={16} />
                <span>Run Spatial Deduplication & Clustering</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Clustering Thresholds Control */}
      <div style={{
        background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        marginBottom: '20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px',
      }}>
        {/* Spatial Radius */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Spatial Clustering Radius:</span>
            <strong style={{ color: '#ec4899' }}>{spatialRadius} meters</strong>
          </div>
          <input
            type="range"
            min="5.0"
            max="35.0"
            step="1.0"
            value={spatialRadius}
            onChange={(e) => setSpatialRadius(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#ec4899', cursor: 'pointer' }}
          />
        </div>

        {/* Visual Similarity Threshold */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>CLIP Visual Similarity Threshold:</span>
            <strong style={{ color: '#38bdf8' }}>{(visualSim * 100).toFixed(0)}%</strong>
          </div>
          <input
            type="range"
            min="0.70"
            max="0.98"
            step="0.02"
            value={visualSim}
            onChange={(e) => setVisualSim(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* Telemetry Metrics Bar */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}>
          <div style={{
            background: 'rgba(236, 72, 153, 0.08)',
            border: '1px solid rgba(236, 72, 153, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: '0.70rem', color: '#f472b6', fontWeight: 700 }}>UNIQUE PHYSICAL WALLS</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f472b6', margin: '2px 0 0 0' }}>
              {stats.unique_canonical_walls || 0} Walls
            </div>
          </div>

          <div style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: '0.70rem', color: '#38bdf8', fontWeight: 700 }}>MULTI-PERSPECTIVE COVERAGE</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8', margin: '2px 0 0 0' }}>
              {stats.multi_view_pct || 0}% ({stats.multi_view_walls_count || 0} Walls)
            </div>
          </div>

          <div style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: '0.70rem', color: '#34d399', fontWeight: 700 }}>DUPLICATES CONSOLIDATED</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#34d399', margin: '2px 0 0 0' }}>
              {stats.duplicates_merged || 0} Slices Merged
            </div>
          </div>
        </div>
      )}

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
              <span>{activeJob.step_name || 'Clustering Wall Perspectives'}</span>
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
                background: 'linear-gradient(90deg, #ec4899, #f43f5e)',
              }}
            />
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {activeJob.message}
          </div>
        </div>
      )}

      {/* Canonical Walls Grid */}
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Canonical Physical Walls ({clusteredWalls.length})
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
          {isLoading ? 'Refreshing...' : 'Refresh Walls'}
        </button>
      </div>

      {clusteredWalls.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          border: '1px dashed var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-secondary)',
          fontSize: '0.88rem',
        }}>
          <GitMerge size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto', display: 'block' }} />
          No clustered wall entities available. Run deduplication above.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
          gap: '16px',
        }}>
          {clusteredWalls.map((wall) => (
            <div
              key={wall.id}
              onClick={() => {
                setSelectedWall(wall);
                setActiveViewIdx(0);
              }}
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
                e.currentTarget.style.borderColor = 'rgba(236, 72, 153, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }}
            >
              {/* Primary View Photo */}
              <div style={{ position: 'relative', width: '100%', height: '170px', background: '#0f172a' }}>
                <img
                  src={wall.primary_view_preview_url || '/placeholder.jpg'}
                  alt={`Wall ${wall.id}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  loading="lazy"
                  onError={e => { e.currentTarget.src = IMG_PLACEHOLDER; }}
                />

                {/* Canonical ID Badge */}
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  left: '8px',
                  background: 'rgba(236, 72, 153, 0.85)',
                  backdropFilter: 'blur(8px)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  color: '#ffffff',
                }}>
                  Canonical Wall #{wall.id}
                </div>

                {/* Perspective Count Pill */}
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(8px)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}>
                  {wall.view_count || wall.views?.length || 1} Perspectives
                </div>
              </div>

              {/* Multi-Perspective Filmstrip */}
              <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Multi-Angle Perspective Coverage:</span>
                  <span style={{ color: '#f472b6', fontWeight: 600 }}>
                    {wall.views?.length || 1} Views Captured
                  </span>
                </div>

                {/* Filmstrip Thumbnails */}
                <div style={{
                  display: 'flex',
                  gap: '6px',
                  overflowX: 'auto',
                  paddingBottom: '6px',
                  marginBottom: '10px',
                }}>
                  {(wall.views || []).slice(0, 6).map((v, i) => (
                    <div
                      key={v.id}
                      style={{
                        width: '46px',
                        height: '36px',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: v.id === wall.primary_view_id ? '2px solid #ec4899' : '1px solid var(--border-subtle)',
                        position: 'relative',
                        background: '#000000',
                      }}
                    >
                      <img
                        src={v.preview_url}
                        alt={`Angle ${v.view_heading}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => { e.currentTarget.src = IMG_PLACEHOLDER; }}
                />
                      <span style={{
                        position: 'absolute',
                        bottom: '0',
                        right: '0',
                        left: '0',
                        background: 'rgba(0, 0, 0, 0.7)',
                        color: '#ffffff',
                        fontSize: '0.56rem',
                        textAlign: 'center',
                      }}>
                        {v.view_heading}&deg;
                      </span>
                    </div>
                  ))}
                </div>

                {/* Footer Tag */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.70rem', color: 'var(--text-muted)', marginTop: 'auto' }}>
                  <span>📍 {wall.latitude.toFixed(5)}, {wall.longitude.toFixed(5)}</span>
                  <span style={{ color: '#ec4899', fontWeight: 600 }}>Explore Multi-View &rarr;</span>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}

      {/* Multi-Perspective Inspection Modal */}
      {selectedWall && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(10px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
        onClick={() => setSelectedWall(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '820px',
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
                <span>Multi-View Perspective Dossier: Canonical Wall #{selectedWall.id}</span>
                <span style={{
                  background: 'rgba(236, 72, 153, 0.15)',
                  color: '#f472b6',
                  fontSize: '0.78rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid rgba(236, 72, 153, 0.3)',
                }}>
                  {selectedWall.views?.length || 1} Perspective Angles
                </span>
              </div>
              <button
                onClick={() => setSelectedWall(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Active View Preview */}
            <div style={{ width: '100%', height: '360px', background: '#000000', display: 'flex', justifyContent: 'center', position: 'relative' }}>
              {selectedWall.views && selectedWall.views[activeViewIdx] && (
                <>
                  <img
                    src={selectedWall.views[activeViewIdx].preview_url}
                    alt={`View ${selectedWall.views[activeViewIdx].id}`}
                    style={{ maxHeight: '360px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
                    onError={e => { e.currentTarget.src = IMG_PLACEHOLDER; }}
                />

                  {/* Heading Overlay Pill */}
                  <div style={{
                    position: 'absolute',
                    bottom: '12px',
                    left: '12px',
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(8px)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <Compass size={14} color="#ec4899" />
                    <span>View Heading: {selectedWall.views[activeViewIdx].view_heading}&deg;</span>
                    {selectedWall.views[activeViewIdx].id === selectedWall.primary_view_id && (
                      <span style={{ color: '#34d399', fontWeight: 800 }}>&bull; (Primary View)</span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* View Selector Filmstrip */}
            <div style={{ padding: '16px 20px' }}>
              <h4 style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px 0' }}>
                Select Perspective Angle to Inspect
              </h4>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                gap: '10px',
                marginBottom: '16px',
              }}>
                {(selectedWall.views || []).map((v, idx) => (
                  <div
                    key={v.id}
                    onClick={() => setActiveViewIdx(idx)}
                    style={{
                      border: idx === activeViewIdx ? '2px solid #ec4899' : '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '4px',
                      cursor: 'pointer',
                      background: idx === activeViewIdx ? 'rgba(236, 72, 153, 0.1)' : 'var(--bg-subtle)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ width: '100%', height: '60px', background: '#000', borderRadius: '4px', overflow: 'hidden', marginBottom: '4px' }}>
                      <img src={v.preview_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}   onError={e => { e.currentTarget.src = IMG_PLACEHOLDER; }}
                />
                    </div>
                    <div style={{ fontSize: '0.70rem', textAlign: 'center', fontWeight: 600, color: idx === activeViewIdx ? '#f472b6' : 'var(--text-secondary)' }}>
                      {v.view_heading}&deg; Heading
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'var(--bg-subtle)', padding: '10px 14px', borderRadius: '6px' }}>
                <span>GPS Location: <strong>{selectedWall.latitude.toFixed(6)}, {selectedWall.longitude.toFixed(6)}</strong></span>
                <span>Overall Quality Score: <strong style={{ color: '#34d399' }}>{selectedWall.overall_score.toFixed(1)} / 100</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
