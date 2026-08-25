import React, { useState, useEffect } from 'react';
import {
  Camera,
  Download,
  Layers,
  Compass,
  Calendar,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  HardDrive,
  Maximize2,
  X,
  Sliders,
} from 'lucide-react';
import {
  triggerImageryIngest,
  fetchImageryList,
  fetchImageryStats,
  subscribeToJobEvents,
  fetchJob,
} from '../services/api';


const IMG_PLACEHOLDER = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'><rect width='200' height='150' fill='%23111827'/><text x='50%25' y='50%25' font-family='sans-serif' font-size='13' fill='%23475569' text-anchor='middle' dy='.3em'>No Image</text></svg>`;

export default function ImageryGallery({ theme, onImageryUpdated }) {
  const [imagery, setImagery] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [maxPerPoint, setMaxPerPoint] = useState(2);
  const [radiusMeters, setRadiusMeters] = useState(25);
  const [selectedImage, setSelectedImage] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [list, s] = await Promise.all([
        fetchImageryList(40, 0),
        fetchImageryStats(),
      ]);
      setImagery(list);
      setStats(s);
    } catch (e) {
      console.error('Failed to load imagery gallery:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStartIngestion = async () => {
    setIsIngesting(true);
    try {
      const jobData = await triggerImageryIngest({
        max_images_per_point: Number(maxPerPoint),
        radius_meters: Number(radiusMeters),
        provider: 'mapillary',
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
            setIsIngesting(false);
            loadData();
            if (onImageryUpdated) onImageryUpdated();
            unsubscribe();
          }
        },
        (err) => {
          console.warn('SSE subscription error, using polling fallback');
        }
      );

      // Polling fallback every 800ms
      const interval = setInterval(async () => {
        try {
          const fresh = await fetchJob(jobId);
          setActiveJob(fresh);
          if (fresh.status === 'completed' || fresh.status === 'failed') {
            clearInterval(interval);
            setIsIngesting(false);
            loadData();
            if (onImageryUpdated) onImageryUpdated();
          }
        } catch (e) {
          clearInterval(interval);
        }
      }, 800);

    } catch (e) {
      console.error('Ingestion failed:', e);
      alert(`Ingestion Error: ${e.message}`);
      setIsIngesting(false);
    }
  };

  const getCompassDirection = (deg) => {
    if (deg === null || deg === undefined) return 'N/A';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(deg / 45) % 8;
    return `${deg.toFixed(0)}° ${directions[idx]}`;
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(236, 72, 153, 0.12)', color: '#ec4899' }}>
            <Camera size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Phase 3: Street-Level Imagery Ingestion
              </h2>
              {stats && (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '20px',
                  background: stats.is_live_api_active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                  color: stats.is_live_api_active ? '#34d399' : '#38bdf8',
                  border: `1px solid ${stats.is_live_api_active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
                }}>
                  {stats.is_live_api_active ? 'Mapillary API Live' : 'Mapillary Local-First Engine'}
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Multi-angle street photography querying, concurrent SHA-256 disk caching, and SQLite metadata indexing
            </p>
          </div>
        </div>

        {/* Stats Pills */}
        {stats && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
              <HardDrive size={14} color="#ec4899" />
              <span>Cached Photos: <strong style={{ color: 'var(--text-primary)' }}>{stats.cached_images}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Mapillary Token Notice & Config Info */}
      <div style={{
        background: stats?.is_live_api_active ? 'rgba(16, 185, 129, 0.06)' : 'rgba(99, 102, 241, 0.08)',
        border: `1px solid ${stats?.is_live_api_active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.2)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        marginBottom: '18px',
        fontSize: '0.82rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Compass size={16} color={stats?.is_live_api_active ? '#34d399' : '#818cf8'} />
          <span style={{ color: 'var(--text-primary)' }}>
            <strong>Provider Status:</strong> {stats?.status_message || 'Ready for ingestion'}
          </span>
        </div>
        {!stats?.is_live_api_active && (
          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
            Tip: To use live Mapillary photos, add <code style={{ color: '#ec4899' }}>MAPILLARY_CLIENT_TOKEN</code> to your <code style={{ color: '#818cf8' }}>.env</code> file.
          </span>
        )}
      </div>

      {/* Ingestion Trigger Control Panel */}
      <div style={{
        background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        marginBottom: '20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '18px',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Max Photos / Coordinate:</span>
            <strong style={{ color: '#ec4899' }}>{maxPerPoint} views</strong>
          </div>
          <input
            type="range"
            min="1"
            max="4"
            step="1"
            value={maxPerPoint}
            onChange={(e) => setMaxPerPoint(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#ec4899', cursor: 'pointer' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Search Radius:</span>
            <strong style={{ color: '#38bdf8' }}>{radiusMeters} meters</strong>
          </div>
          <input
            type="range"
            min="10"
            max="50"
            step="5"
            value={radiusMeters}
            onChange={(e) => setRadiusMeters(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
          />
        </div>

        <div>
          <button
            onClick={handleStartIngestion}
            disabled={isIngesting}
            className="btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
            }}
          >
            {isIngesting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Ingesting Imagery...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Ingest Street-Level Photos</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Ingestion Job Progress Banner */}
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
              <span>{activeJob.step_name || 'Processing Ingestion Task'}</span>
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

      {/* Imagery Photo Grid */}
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Cached Street Photography ({imagery.length})
        </h3>
        <button
          onClick={loadData}
          disabled={isLoading}
          style={{
            background: 'none',
            border: 'none',
            color: '#818cf8',
            fontSize: '0.8rem',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {isLoading ? 'Refreshing...' : 'Refresh Gallery'}
        </button>
      </div>

      {imagery.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          border: '1px dashed var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-secondary)',
          fontSize: '0.88rem',
        }}>
          <Camera size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto', display: 'block' }} />
          No street imagery ingested yet.
          <div style={{ fontSize: '0.78rem', marginTop: '6px', color: 'var(--text-muted)' }}>
            Click <strong>"Ingest Street-Level Photos"</strong> above to query and download multi-view street imagery into the local cache.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px',
        }}>
          {imagery.map((img) => (
            <div
              key={img.id}
              onClick={() => setSelectedImage(img)}
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
                e.currentTarget.style.borderColor = 'rgba(236, 72, 153, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }}
            >
              {/* Image Preview Container */}
              <div style={{ position: 'relative', width: '100%', height: '150px', background: '#0f172a' }}>
                <img
                  src={img.preview_url}
                  alt={`Street view ${img.id}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  loading="lazy"
                  onError={e => { e.currentTarget.src = IMG_PLACEHOLDER; }}
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
                  color: '#38bdf8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <Compass size={11} />
                  <span>{getCompassDirection(img.heading)}</span>
                </div>

                {/* Provider Badge */}
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  background: 'rgba(236, 72, 153, 0.85)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  textTransform: 'uppercase',
                }}>
                  {img.provider}
                </div>
              </div>

              {/* Card Body */}
              <div style={{ padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  <span>Lat: {img.latitude.toFixed(4)}</span>
                  <span>Lon: {img.longitude.toFixed(4)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <span>{img.width} &times; {img.height} px</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>#{img.file_hash?.substring(0, 8)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedImage && (
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
        onClick={() => setSelectedImage(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '860px',
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
                Street Photography Record: <span style={{ color: '#ec4899' }}>{selectedImage.external_id || selectedImage.id}</span>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ width: '100%', maxHeight: '460px', background: '#0f172a', display: 'flex', justifyContent: 'center' }}>
              <img
                src={selectedImage.preview_url}
                alt="Detailed Street View"
                style={{ maxHeight: '460px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
                onError={e => { e.currentTarget.src = IMG_PLACEHOLDER; }}
              />
            </div>

            <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', fontSize: '0.82rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>COORDINATES</span>
                <strong style={{ color: 'var(--text-primary)' }}>{selectedImage.latitude.toFixed(5)}, {selectedImage.longitude.toFixed(5)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>COMPASS HEADING</span>
                <strong style={{ color: '#38bdf8' }}>{getCompassDirection(selectedImage.heading)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>IMAGE RESOLUTION</span>
                <strong style={{ color: 'var(--text-primary)' }}>{selectedImage.width} &times; {selectedImage.height} px</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>CACHE SHA-256</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#ec4899' }}>{selectedImage.file_hash?.substring(0, 16)}...</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
