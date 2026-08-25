import React, { useState, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  MapPin,
  Compass,
  Filter,
  Layers,
  Eye,
  Award,
  Sparkles,
  ExternalLink,
  X,
  ChevronRight,
  Maximize2,
  CheckCircle2,
  Sliders,
} from 'lucide-react';
import { fetchClusteredWalls, fetchSearchAreas } from '../services/api';

const DEFAULT_CENTER = [-123.104, 49.263]; // Vancouver BC
const DEFAULT_ZOOM = 14.5;

// Placeholder SVG for broken/missing images
const IMG_PLACEHOLDER = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'><rect width='200' height='150' fill='%23111827'/><text x='50%25' y='50%25' font-family='sans-serif' font-size='13' fill='%23475569' text-anchor='middle' dy='.3em'>No Image</text></svg>`;

export default function MapProspector({ theme, onWallSelected }) {
  const mapContainer = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);

  const [candidates, setCandidates] = useState([]);
  const [searchAreas, setSearchAreas] = useState([]);
  const [selectedWall, setSelectedWall] = useState(null);
  const [activeViewIdx, setActiveViewIdx] = useState(0);

  // Filter States
  const [filterGrade, setFilterGrade] = useState('ALL');
  const [filterMaterial, setFilterMaterial] = useState('ALL');
  const [filterSize, setFilterSize] = useState('ALL');
  const [excludedMaterials, setExcludedMaterials] = useState([]);

  const toggleExcludeMaterial = (mat) => {
    if (excludedMaterials.includes(mat)) {
      setExcludedMaterials(excludedMaterials.filter((m) => m !== mat));
    } else {
      setExcludedMaterials([...excludedMaterials, mat]);
    }
  };

  const loadData = async () => {
    try {
      const [walls, areas] = await Promise.all([
        fetchClusteredWalls(50, 0),
        fetchSearchAreas(),
      ]);
      setCandidates(walls);
      setSearchAreas(areas);

      // Auto-fly map to actual candidate coordinates when data loads
      if (walls && walls.length > 0 && mapInstance.current) {
        const map = mapInstance.current;
        const firstWall = walls[0];
        if (map.loaded()) {
          map.flyTo({
            center: [firstWall.longitude, firstWall.latitude],
            zoom: 14.5,
            speed: 1.2,
            curve: 1.4,
          });
        } else {
          map.once('load', () => {
            map.flyTo({
              center: [firstWall.longitude, firstWall.latitude],
              zoom: 14.5,
            });
          });
        }
      }
    } catch (e) {
      console.error('Failed to load map prospector data:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getStyleForTheme = (t) => {
    return t === 'light'
      ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
      : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
  };

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainer.current) return;

    if (!mapInstance.current) {
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: getStyleForTheme(theme),
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        pitch: 35,
        bearing: -15,
        attributionControl: false,
      });

      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

      mapInstance.current = map;
    } else {
      mapInstance.current.setStyle(getStyleForTheme(theme));
    }

    return () => {};
  }, [theme]);

  // Render Wall Markers & GeoJSON on Map
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Filter Candidates
    const filtered = candidates.filter((c) => {
      if (filterGrade !== 'ALL') {
        const baseGrade = (c.grade || (c.overall_score >= 90 ? 'A' : c.overall_score >= 80 ? 'B' : 'C')).replace('+', '');
        if (baseGrade !== filterGrade) return false;
      }
      if (filterMaterial !== 'ALL' && (c.wall_material || 'brick').toLowerCase() !== filterMaterial.toLowerCase()) {
        return false;
      }
      if (filterSize !== 'ALL' && (c.estimated_size || 'medium').toLowerCase() !== filterSize.toLowerCase()) {
        return false;
      }
      if (excludedMaterials.some((ex) => (c.wall_material || '').toLowerCase().includes(ex.toLowerCase()))) {
        return false;
      }
      return true;
    });

    // Add Markers for Filtered Candidates
    filtered.forEach((c) => {
      const score = c.overall_score || 75.0;
      let pinColor = '#f59e0b';
      let gradeLabel = 'C';
      if (score >= 90.0) {
        pinColor = '#10b981';
        gradeLabel = 'A';
      } else if (score >= 80.0) {
        pinColor = '#38bdf8';
        gradeLabel = 'B';
      } else if (score < 70.0) {
        pinColor = '#ef4444';
        gradeLabel = 'D';
      }

      // Marker DOM Element
      const el = document.createElement('div');
      el.className = 'custom-wall-marker';
      el.style.width = '36px';
      el.style.height = '36px';
      el.style.borderRadius = '50%';
      el.style.background = `radial-gradient(circle at 30% 30%, ${pinColor}, #0f172a)`;
      el.style.border = `2px solid ${pinColor}`;
      el.style.boxShadow = `0 0 14px ${pinColor}88, 0 4px 8px rgba(0,0,0,0.6)`;
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.cursor = 'pointer';
      el.style.transition = 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
      el.style.color = '#ffffff';
      el.style.fontSize = '12px';
      el.style.fontWeight = '800';
      el.innerText = gradeLabel;

      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.25) translateY(-4px)';
        el.style.zIndex = '100';
      });

      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1) translateY(0)';
        el.style.zIndex = '1';
      });

      el.addEventListener('click', () => {
        setSelectedWall(c);
        setActiveViewIdx(0);
        map.flyTo({
          center: [c.longitude, c.latitude],
          zoom: 17.8,
          pitch: 50,
          bearing: c.primary_view_heading || 0,
          speed: 1.2,
          curve: 1.4,
        });
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([c.longitude, c.latitude])
        .addTo(map);

      markersRef.current.push(marker);
    });

  }, [candidates, filterGrade, filterMaterial, filterSize]);

  const getGradeStyle = (grade, score) => {
    if (score >= 90 || grade?.startsWith('A')) return { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: '#10b981' };
    if (score >= 80 || grade?.startsWith('B')) return { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: '#0284c7' };
    if (score >= 70 || grade?.startsWith('C')) return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: '#d97706' };
    return { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: '#ef4444' };
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            <MapPin size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Phase 11: Interactive MapLibre Prospecting Interface
              </h2>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '20px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}>
                Geospatial HUD
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Explore candidate walls on a dynamic vector map with Grade Tier pins, camera heading vectors, and slide-out intelligence drawer
            </p>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={loadData}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px', padding: '6px 14px',
            color: '#34d399', fontSize: '0.76rem', fontWeight: 700,
            cursor: 'pointer', transition: 'all 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.22)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)'}
        >
          ↺ Refresh &amp; Fly to Results
        </button>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.74rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#34d399' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
            Tier A (90+)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#38bdf8' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#38bdf8' }} />
            Tier B (80-89)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fbbf24' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />
            Tier C (70-79)
          </span>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div style={{
        background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 16px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Filter size={14} color="#10b981" />
            <span>Map Filters:</span>
          </span>

          {/* Grade Tier Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Grade:</span>
            {['ALL', 'A', 'B', 'C'].map((g) => (
              <button
                key={g}
                onClick={() => setFilterGrade(g)}
                style={{
                  background: filterGrade === g ? 'rgba(16, 185, 129, 0.2)' : 'none',
                  border: filterGrade === g ? '1px solid #10b981' : '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  color: filterGrade === g ? '#34d399' : 'var(--text-secondary)',
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  fontWeight: filterGrade === g ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {g === 'ALL' ? 'All Tiers' : `Tier ${g}`}
              </button>
            ))}
          </div>

          {/* Wall Material Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Material:</span>
            {['ALL', 'brick', 'concrete', 'stucco'].map((m) => (
              <button
                key={m}
                onClick={() => setFilterMaterial(m)}
                style={{
                  background: filterMaterial === m ? 'rgba(56, 189, 248, 0.2)' : 'none',
                  border: filterMaterial === m ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  color: filterMaterial === m ? '#38bdf8' : 'var(--text-secondary)',
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  textTransform: 'capitalize',
                  fontWeight: filterMaterial === m ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Hard Material Exclusion Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem' }}>
            <span style={{ color: '#f87171', fontWeight: 600 }}>Exclusions:</span>
            {['brick', 'stone', 'stucco'].map((mat) => {
              const isExcluded = excludedMaterials.includes(mat);
              return (
                <button
                  key={mat}
                  onClick={() => toggleExcludeMaterial(mat)}
                  style={{
                    background: isExcluded ? 'rgba(239, 68, 68, 0.25)' : 'none',
                    border: isExcluded ? '1px solid #ef4444' : '1px dashed var(--border-subtle)',
                    borderRadius: '4px',
                    color: isExcluded ? '#f87171' : 'var(--text-muted)',
                    padding: '2px 6px',
                    fontSize: '0.70rem',
                    fontWeight: isExcluded ? 700 : 500,
                    cursor: 'pointer',
                    textDecoration: isExcluded ? 'line-through' : 'none',
                  }}
                >
                  {isExcluded ? `✕ Excluded` : `Exclude ${mat}`}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
          Showing <strong>{candidates.length}</strong> Prospecting Targets
        </div>
      </div>

      {/* Main Map Container & Slide-Out Drawer HUD */}
      <div style={{ position: 'relative', width: '100%', height: '520px', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
        
        {/* MapLibre Canvas Container */}
        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

        {/* Standby Empty State Overlay when no candidates exist */}
        {candidates.length === 0 && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(16px)',
            border: '1px dashed rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            padding: '24px 32px',
            textAlign: 'center',
            zIndex: 10,
            maxWidth: '440px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
          }}>
            <MapPin size={32} color="#10b981" style={{ margin: '0 auto 8px auto', display: 'block' }} />
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
              Map Prospector Ready
            </div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              No mural wall candidates generated yet. Complete Phase 2 geographic sampling and Phase 3 imagery ingestion above to prospect wall targets on this map.
            </div>
          </div>
        )}

        {/* Slide-out Wall Inspection Drawer */}
        {selectedWall && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              bottom: '12px',
              width: '380px',
              maxWidth: 'calc(100% - 24px)',
              background: 'rgba(15, 23, 42, 0.94)',
              backdropFilter: 'blur(16px)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.7)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 1000,
              overflowY: 'auto',
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            {/* Drawer Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 800, color: '#f8fafc', fontSize: '0.92rem' }}>
                  Canonical Wall #{selectedWall.id}
                </span>
                {(() => {
                  const gStyle = getGradeStyle(selectedWall.grade, selectedWall.overall_score);
                  return (
                    <span style={{
                      background: gStyle.bg,
                      border: `1px solid ${gStyle.border}`,
                      color: gStyle.text,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                    }}>
                      {selectedWall.grade || 'B'} &bull; {selectedWall.overall_score?.toFixed(1) || 82.0}
                    </span>
                  );
                })()}
              </div>

              <button
                onClick={() => setSelectedWall(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Active Perspective Photo Preview */}
            <div style={{ position: 'relative', width: '100%', height: '200px', background: '#0f172a' }}>
              {selectedWall.views && selectedWall.views[activeViewIdx] ? (
                <img
                  src={selectedWall.views[activeViewIdx].preview_url}
                  alt={`View ${selectedWall.views[activeViewIdx].id}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => { e.currentTarget.src = IMG_PLACEHOLDER; }}
                />
              ) : (
                <img
                  src={selectedWall.primary_view_preview_url || IMG_PLACEHOLDER}
                  alt="Wall preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => { e.currentTarget.src = IMG_PLACEHOLDER; }}
                />
              )}

              {/* View Heading Compass */}
              <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                background: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(6px)',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '0.72rem',
                color: '#ffffff',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <Compass size={12} color="#ec4899" />
                <span>
                  Angle: {selectedWall.views?.[activeViewIdx]?.view_heading ?? selectedWall.primary_view_heading ?? 0}&deg;
                </span>
              </div>
            </div>

            {/* Multi-Angle Filmstrip Selector */}
            {selectedWall.views && selectedWall.views.length > 1 && (
              <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '6px' }}>
                  Select Angle Perspective ({selectedWall.views.length} views):
                </div>
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {selectedWall.views.map((v, i) => (
                    <div
                      key={v.id}
                      onClick={() => setActiveViewIdx(i)}
                      style={{
                        width: '44px',
                        height: '34px',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        flexShrink: 0,
                        border: i === activeViewIdx ? '2px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.2)',
                      }}
                    >
                      <img src={v.preview_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.src = IMG_PLACEHOLDER; }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Paintability Dossier Attributes */}
            <div style={{ padding: '14px', flex: 1 }}>
              
              {/* Component Score Bars */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
                  Component Score Breakdown
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.70rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                    <span>Wall Quality (W):</span>
                    <strong style={{ color: '#38bdf8' }}>{selectedWall.wall_score?.toFixed(0) || 70}/100</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                    <span>Canvas Blankness (B):</span>
                    <strong style={{ color: '#10b981' }}>{selectedWall.blankness_score?.toFixed(0) || 75}/100</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                    <span>Street Visibility (V):</span>
                    <strong style={{ color: '#a78bfa' }}>{selectedWall.visibility_score?.toFixed(0) || 80}/100</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                    <span>Equipment Access (A):</span>
                    <strong style={{ color: '#f472b6' }}>{selectedWall.access_score?.toFixed(0) || 85}/100</strong>
                  </div>
                </div>
              </div>

              {/* Surface & Structural Tags */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginBottom: '14px',
                fontSize: '0.72rem',
              }}>
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px', borderRadius: '4px' }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.64rem' }}>MATERIAL</div>
                  <strong style={{ color: '#f8fafc', textTransform: 'capitalize' }}>
                    🧱 {selectedWall.wall_material || 'Masonry'}
                  </strong>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px', borderRadius: '4px' }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.64rem' }}>CANVAS SIZE</div>
                  <strong style={{ color: '#f8fafc', textTransform: 'uppercase' }}>
                    {selectedWall.estimated_size || 'Large'}
                  </strong>
                </div>
              </div>

              {/* External Navigation Links */}
              <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${selectedWall.latitude},${selectedWall.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    width: '100%',
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '6px',
                    padding: '8px',
                    color: '#38bdf8',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={14} />
                  <span>Open in Google Street View</span>
                </a>
              </div>

            </div>
          </div>
        )}

      </div>

    </div>
  );
}
