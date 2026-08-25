import React, { useState, useEffect } from 'react';
import {
  Maximize,
  Compass,
  Sliders,
  Play,
  CheckCircle2,
  Loader2,
  Layers,
  Sparkles,
  Grid3X3,
  Eye,
  X,
  Camera,
} from 'lucide-react';
import {
  triggerViewGeneration,
  fetchCandidateViews,
  fetchViewStats,
  subscribeToJobEvents,
  fetchJob,
} from '../services/api';

export default function ViewGenerator({ theme, onViewCreated }) {
  const [views, setViews] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [headingsCount, setHeadingsCount] = useState(4);
  const [fovDegrees, setFovDegrees] = useState(90);
  const [resolution, setResolution] = useState(512);
  const [selectedView, setSelectedView] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [vList, s] = await Promise.all([
        fetchCandidateViews(40, 0),
        fetchViewStats(),
      ]);
      setViews(vList);
      setStats(s);
    } catch (e) {
      console.error('Failed to load candidate views:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerateViews = async () => {
    setIsGenerating(true);
    try {
      const jobData = await triggerViewGeneration({
        headings_count: Number(headingsCount),
        fov_degrees: Number(fovDegrees),
        resolution: Number(resolution),
      });

      const jobId = jobData.job_id;
      setActiveJob(jobData);

      // Subscribe to SSE updates
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
            setIsGenerating(false);
            loadData();
            if (onViewCreated) onViewCreated();
            unsubscribe();
          }
        },
        () => {}
      );

      // Polling fallback
      const interval = setInterval(async () => {
        try {
          const fresh = await fetchJob(jobId);
          setActiveJob(fresh);
          if (fresh.status === 'completed' || fresh.status === 'failed') {
            clearInterval(interval);
            setIsGenerating(false);
            loadData();
            if (onViewCreated) onViewCreated();
          }
        } catch (e) {
          clearInterval(interval);
        }
      }, 800);

    } catch (e) {
      console.error('View generation failed:', e);
      alert(`View Generation Error: ${e.message}`);
      setIsGenerating(false);
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
          <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa' }}>
            <Grid3X3 size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Phase 4: Panorama Directional Slicing & Perspective Views
              </h2>
              {stats && (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '20px',
                  background: 'rgba(139, 92, 246, 0.15)',
                  color: '#c4b5fd',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                }}>
                  {stats.total_views} Views Ready for AI
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Equirectangular-to-rectilinear projection, multi-heading camera slicing, and wall-facing framing
            </p>
          </div>
        </div>

        {/* Stats Summary */}
        {stats && (
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Pano Slices: <strong style={{ color: '#a78bfa' }}>{stats.panoramic_slices}</strong>
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              Flat Views: <strong style={{ color: '#38bdf8' }}>{stats.flat_perspective_views}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Control Panel: Headings, FOV, Resolution */}
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
        
        {/* Headings Count Selector */}
        <div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 500 }}>
            Directional Slices:
          </div>
          <select
            value={headingsCount}
            onChange={(e) => setHeadingsCount(Number(e.target.value))}
            style={{
              width: '100%',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              fontFamily: 'var(--font-main)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="4">4 Cardinal (0°, 90°, 180°, 270°)</option>
            <option value="8">8 Octants (Every 45°)</option>
            <option value="2">2 Lateral (90°, 270° Wall Slices)</option>
            <option value="1">1 Direct (Front Facing)</option>
          </select>
        </div>

        {/* FOV Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Field of View (FOV):</span>
            <strong style={{ color: '#a78bfa' }}>{fovDegrees}°</strong>
          </div>
          <input
            type="range"
            min="60"
            max="110"
            step="5"
            value={fovDegrees}
            onChange={(e) => setFovDegrees(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#8b5cf6', cursor: 'pointer' }}
          />
        </div>

        {/* Action Button */}
        <div>
          <button
            onClick={handleGenerateViews}
            disabled={isGenerating}
            className="btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
            }}
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Slicing Perspectives...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>Generate Perspective Views</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* Live Job Progress Banner */}
      {activeJob && (
        <div style={{
          background: 'rgba(139, 92, 246, 0.08)',
          border: '1px solid rgba(139, 92, 246, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              {activeJob.status === 'running' && <Loader2 size={16} className="animate-spin" color="#a78bfa" />}
              {activeJob.status === 'completed' && <CheckCircle2 size={16} color="#34d399" />}
              <span>{activeJob.step_name || 'Processing Perspective Slicing'}</span>
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#a78bfa' }}>
              {(activeJob.progress || 0).toFixed(0)}%
            </span>
          </div>

          <div className="progress-bar-bg" style={{ marginBottom: '8px' }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${activeJob.progress || 0}%`,
                background: 'linear-gradient(90deg, #8b5cf6, #38bdf8)',
              }}
            />
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {activeJob.message}
          </div>
        </div>
      )}

      {/* Perspective Views Grid */}
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Directional Candidate Views ({views.length})
        </h3>
        <button
          onClick={loadData}
          disabled={isLoading}
          style={{
            background: 'none',
            border: 'none',
            color: '#a78bfa',
            fontSize: '0.8rem',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {isLoading ? 'Refreshing...' : 'Refresh Views'}
        </button>
      </div>

      {views.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          border: '1px dashed var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-secondary)',
          fontSize: '0.88rem',
        }}>
          <Grid3X3 size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto', display: 'block' }} />
          No directional perspective views generated yet.
          <div style={{ fontSize: '0.78rem', marginTop: '6px', color: 'var(--text-muted)' }}>
            Click <strong>"Generate Perspective Views"</strong> to project spherical/panoramic imagery into clean wall-facing perspective crops.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '14px',
        }}>
          {views.map((v) => (
            <div
              key={v.id}
              onClick={() => setSelectedView(v)}
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
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }}
            >
              {/* Image Preview Container */}
              <div style={{ position: 'relative', width: '100%', height: '160px', background: '#0f172a' }}>
                <img
                  src={v.preview_url}
                  alt={`Candidate view ${v.id}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  loading="lazy"
                />
                
                {/* Heading Badge */}
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
                  color: '#a78bfa',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <Compass size={11} />
                  <span>{getCompassDirection(v.view_heading)}</span>
                </div>

                {/* Sliced vs Flat Badge */}
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  background: v.is_sliced_from_pano ? 'rgba(139, 92, 246, 0.85)' : 'rgba(56, 189, 248, 0.85)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  color: '#ffffff',
                }}>
                  {v.is_sliced_from_pano ? 'Pano Slice' : 'Rectified'}
                </div>
              </div>

              {/* Card Body */}
              <div style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  <span>Source Image #{v.imagery_id}</span>
                  <span>FOV {v.fov_degrees}°</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                  <span>{v.width} &times; {v.height} px</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>#{v.file_hash?.substring(0, 8)}</span>
                </div>
              </div>
            </div>
          ))}
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
              maxWidth: '680px',
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
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>
                Directional Perspective View #{selectedView.id}
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
                alt="Detailed Perspective View"
                style={{ maxHeight: '420px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
              />
            </div>

            <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px', fontSize: '0.82rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>PERSPECTIVE HEADING</span>
                <strong style={{ color: '#a78bfa' }}>{getCompassDirection(selectedView.view_heading)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>FIELD OF VIEW (FOV)</span>
                <strong style={{ color: 'var(--text-primary)' }}>{selectedView.fov_degrees}° Pinhole</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>PROJECTION TYPE</span>
                <strong style={{ color: '#38bdf8' }}>{selectedView.is_sliced_from_pano ? '360 Equirectangular Slice' : 'Rectilinear View'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>CACHE FILE HASH</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#ec4899' }}>{selectedView.file_hash?.substring(0, 16)}...</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
