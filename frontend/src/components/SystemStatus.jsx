import React from 'react';
import { Database, HardDrive, Sliders, Cpu, CheckCircle2 } from 'lucide-react';

export default function SystemStatus({ health, config, cacheStats }) {
  const weights = config?.scoring_weights || {
    wall: 0.30,
    blankness: 0.25,
    visibility: 0.20,
    accessibility: 0.15,
    confidence: 0.10
  };

  const weightLabels = [
    { key: 'wall', label: 'Wall Suitability', color: '#6366f1', pct: Math.round(weights.wall * 100) },
    { key: 'blankness', label: 'Blank Surface', color: '#06b6d4', pct: Math.round(weights.blankness * 100) },
    { key: 'visibility', label: 'Street Visibility', color: '#8b5cf6', pct: Math.round(weights.visibility * 100) },
    { key: 'accessibility', label: 'Ground Access', color: '#10b981', pct: Math.round(weights.accessibility * 100) },
    { key: 'confidence', label: 'Multi-View Conf.', color: '#f59e0b', pct: Math.round(weights.confidence * 100) },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '24px' }}>
      
      {/* 1. Compute & System Info */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.12)', color: '#818cf8' }}>
              <Cpu size={18} />
            </div>
            <h3 style={{ fontSize: '0.98rem', fontWeight: 600, margin: 0 }}>Compute Engine</h3>
          </div>
          <span className="badge badge-cyan">{health?.detected_device?.toUpperCase() || 'CPU'}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Hardware Target</span>
            <strong style={{ color: '#38bdf8' }}>{health?.device_name || 'Apple Metal (MPS)'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Python Runtime</span>
            <span>{health?.python_version || '3.9.7'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>OS Platform</span>
            <span>{health?.os_platform || 'Darwin (macOS)'}</span>
          </div>
        </div>
      </div>

      {/* 2. Database & Storage Architecture */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', color: '#34d399' }}>
              <Database size={18} />
            </div>
            <h3 style={{ fontSize: '0.98rem', fontWeight: 600, margin: 0 }}>Storage Layer</h3>
          </div>
          <span className="badge badge-emerald">Active</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Primary Store</span>
            <strong>SQLite + PostGIS abstraction</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Cached Images</span>
            <strong>{cacheStats?.total_files || 0} files ({cacheStats?.total_mb || 0} MB)</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Deduplication</span>
            <span style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={13} /> SHA-256 Enabled
            </span>
          </div>
        </div>
      </div>

      {/* 3. Scoring Weights Configuration */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24' }}>
              <Sliders size={18} />
            </div>
            <h3 style={{ fontSize: '0.98rem', fontWeight: 600, margin: 0 }}>Mural Scoring Weights</h3>
          </div>
          <span className="badge badge-amber">100% Total</span>
        </div>

        {/* Breakdown bar */}
        <div style={{ height: '8px', width: '100%', borderRadius: '4px', display: 'flex', overflow: 'hidden', marginBottom: '12px' }}>
          {weightLabels.map((w) => (
            <div key={w.key} style={{ width: `${w.pct}%`, backgroundColor: w.color }} title={`${w.label}: ${w.pct}%`} />
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.78rem' }}>
          {weightLabels.map((w) => (
            <div key={w.key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: w.color }} />
              <span style={{ color: 'var(--text-secondary)' }}>{w.label}:</span>
              <strong>{w.pct}%</strong>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
