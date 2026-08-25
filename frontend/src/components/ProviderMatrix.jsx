import React from 'react';
import { Map, Image, Eye, Compass, CheckCircle2, AlertCircle, Shield } from 'lucide-react';

export default function ProviderMatrix({ config }) {
  const providers = config?.all_providers || [];
  const activeMap = config?.active_providers || {};

  const categories = [
    {
      id: 'geodata',
      title: '1. Geospatial Data',
      icon: Map,
      color: '#6366f1',
      desc: 'Extracts road networks & building footprints for candidate coordinate generation.',
      active: activeMap.geodata || 'osm (mocked in Phase 1)'
    },
    {
      id: 'imagery',
      title: '2. Street Imagery',
      icon: Image,
      color: '#06b6d4',
      desc: 'Retrieves multi-view street-level imagery and caches locally.',
      active: activeMap.imagery || 'mapillary (mocked in Phase 1)'
    },
    {
      id: 'vision_ranker',
      title: '3. Stage 1 Vision Ranker',
      icon: Eye,
      color: '#8b5cf6',
      desc: 'Fast local embedding prompt comparison (OpenCLIP / SigLIP) on bulk photos.',
      active: activeMap.vision_ranker || 'openclip (mocked in Phase 1)'
    },
    {
      id: 'vision_analyzer',
      title: '4. Stage 2 Vision Analyzer',
      icon: Compass,
      color: '#10b981',
      desc: 'Structured wall attribute extractor (Local VLM / OpenAI verification).',
      active: activeMap.vision_analyzer || 'local_vlm (mocked in Phase 1)'
    },
  ];

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 4px 0' }}>
            Provider Abstraction Architecture
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 }}>
            Core scoring engine is fully decoupled from third-party APIs
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
          <Shield size={14} />
          <span>Local-First Design Enforced</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <div
              key={cat.id}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ padding: '6px', borderRadius: '8px', background: `${cat.color}22`, color: cat.color }}>
                    <Icon size={16} />
                  </div>
                  <h4 style={{ fontSize: '0.92rem', fontWeight: 600, margin: 0 }}>{cat.title}</h4>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: '12px' }}>
                  {cat.desc}
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Selected:</span>
                <span style={{ fontWeight: 600, color: '#f8fafc', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px' }}>
                  {cat.active}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
