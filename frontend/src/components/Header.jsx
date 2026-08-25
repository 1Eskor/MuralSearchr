import React from 'react';
import { Sparkles, Cpu, Layers, RefreshCw, Sun, Moon } from 'lucide-react';

export default function Header({ health, onRefresh, isRefreshing, theme, onToggleTheme }) {
  const deviceName = health?.device_name || 'Detecting...';
  const isMps = health?.detected_device === 'mps';
  const isCuda = health?.detected_device === 'cuda';

  return (
    <header style={{
      borderBottom: '1px solid var(--border-subtle)',
      backgroundColor: 'var(--bg-header, rgba(7, 10, 18, 0.85))',
      backdropFilter: 'blur(16px)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      padding: '16px 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)'
        }}>
          <Sparkles size={22} color="#ffffff" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0, color: 'var(--text-primary)' }}>
              Mural Search
            </h1>
            <span className="badge badge-cyan" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
              Phase 1 Core
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
            Local-First Wall Prospecting Engine
          </p>
        </div>
      </div>

      {/* Hardware / Engine Status Badges & Theme Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Device Chip */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          background: 'var(--bg-subtle, rgba(255,255,255,0.03))',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          fontSize: '0.82rem'
        }}>
          <Cpu size={15} color={isMps ? '#38bdf8' : isCuda ? '#34d399' : '#94a3b8'} />
          <span style={{ color: 'var(--text-secondary)' }}>Hardware:</span>
          <strong style={{ color: isMps ? '#38bdf8' : isCuda ? '#34d399' : 'var(--text-primary)' }}>
            {deviceName}
          </strong>
        </div>

        {/* Live Backend Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '10px',
          fontSize: '0.82rem'
        }}>
          <div className="pulse-dot" />
          <span style={{ color: '#34d399', fontWeight: 600 }}>Backend Online</span>
        </div>

        {/* Refresh Button */}
        <button 
          onClick={onRefresh}
          className="btn-secondary"
          title="Refresh telemetry"
          style={{ padding: '8px 12px' }}
        >
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
        </button>

        {/* Theme Toggle Button in Upper Right */}
        <button 
          onClick={onToggleTheme}
          className="btn-secondary"
          title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
          style={{ 
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: theme === 'light' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.06)',
            borderColor: theme === 'light' ? 'var(--border-accent)' : 'var(--border-subtle)'
          }}
        >
          {theme === 'dark' ? (
            <>
              <Sun size={15} color="#fbbf24" />
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Light Mode</span>
            </>
          ) : (
            <>
              <Moon size={15} color="#6366f1" />
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Dark Mode</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}

