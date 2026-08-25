import React, { useState } from 'react';
import { HardDrive, Trash2, Folder, CheckCircle2, ShieldCheck, Loader2 } from 'lucide-react';
import { clearCache } from '../services/api';

export default function CacheInspector({ stats, onCacheCleared }) {
  const [isClearing, setIsClearing] = useState(false);

  const handleClear = async () => {
    if (!window.confirm('Are you sure you want to purge the local image cache?')) return;
    setIsClearing(true);
    try {
      await clearCache();
      if (onCacheCleared) onCacheCleared();
    } catch (e) {
      console.error('Failed to clear cache', e);
    } finally {
      setIsClearing(false);
    }
  };

  const usagePercent = stats?.usage_percent || 0;

  return (
    <div className="glass-card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 4px 0' }}>
            Local Image Cache Manager
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 }}>
            Filesystem cache with SHA-256 content deduplication and sharding
          </p>
        </div>

        <button
          onClick={handleClear}
          disabled={isClearing || stats?.total_files === 0}
          className="btn-secondary"
          style={{ color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.3)' }}
        >
          {isClearing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          <span>Purge Cache</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
        <div style={{ background: 'var(--bg-subtle, rgba(255,255,255,0.02))', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>CACHED IMAGES</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8' }}>{stats?.total_files || 0}</div>
        </div>

        <div style={{ background: 'var(--bg-subtle, rgba(255,255,255,0.02))', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>STORAGE USED</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {stats?.total_mb || 0} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>MB</span>
          </div>
        </div>

        <div style={{ background: 'var(--bg-subtle, rgba(255,255,255,0.02))', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>CACHE LIMIT</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            {stats?.max_mb || 5000} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>MB</span>
          </div>
        </div>

        <div style={{ background: 'var(--bg-subtle, rgba(255,255,255,0.02))', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>DEDUPLICATION HASH</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={18} /> SHA-256 Active
          </div>
        </div>
      </div>

      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <Folder size={14} color="#6366f1" />
        <span>Cache Path: <code style={{ color: 'var(--text-secondary)', background: 'var(--bg-subtle)', padding: '2px 6px', borderRadius: '4px' }}>{stats?.cache_dir || './data/cache'}</code></span>
      </div>
    </div>
  );
}
