import React, { useState, useEffect } from 'react';
import {
  Download,
  FileSpreadsheet,
  Globe,
  FileText,
  Search,
  Sliders,
  Filter,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Award,
  Layers,
  Copy,
  Check,
  X,
  Eye,
} from 'lucide-react';
import {
  searchCandidates,
  fetchExecutiveDossier,
  getExportCsvUrl,
  getExportGeoJsonUrl,
} from '../services/api';

const IMG_PLACEHOLDER = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'><rect width='200' height='150' fill='%23111827'/><text x='50%25' y='50%25' font-family='sans-serif' font-size='13' fill='%23475569' text-anchor='middle' dy='.3em'>No Image</text></svg>`;

export default function SearchExportPanel({ theme }) {
  const [queryText, setQueryText] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [minBlankness, setMinBlankness] = useState(0);
  const [grade, setGrade] = useState('ALL');
  const [wallMaterial, setWallMaterial] = useState('ALL');
  const [excludedMaterials, setExcludedMaterials] = useState([]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [dossierModal, setDossierModal] = useState(null);

  const toggleExcludeMaterial = (mat) => {
    if (excludedMaterials.includes(mat)) {
      setExcludedMaterials(excludedMaterials.filter((m) => m !== mat));
    } else {
      setExcludedMaterials([...excludedMaterials, mat]);
    }
  };

  const executeSearch = async () => {
    setIsLoading(true);
    try {
      const data = await searchCandidates({
        query_text: queryText,
        min_score: minScore,
        min_blankness: minBlankness,
        grade: grade,
        wall_material: wallMaterial,
        verified_only: verifiedOnly,
        excluded_materials: excludedMaterials.length > 0 ? excludedMaterials.join(',') : undefined,
      });
      setResults(data);
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    executeSearch();
  }, [queryText, minScore, minBlankness, grade, wallMaterial, excludedMaterials, verifiedOnly]);

  const handleCopyCoordinates = (c) => {
    navigator.clipboard.writeText(`${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}`);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleOpenDossier = async () => {
    try {
      const dossier = await fetchExecutiveDossier(minScore);
      setDossierModal(dossier);
    } catch (e) {
      alert(`Failed to generate executive dossier: ${e.message}`);
    }
  };

  const getGradeStyle = (score) => {
    if (score >= 90) return { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: '#10b981', label: 'A' };
    if (score >= 80) return { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: '#0284c7', label: 'B' };
    if (score >= 70) return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: '#d97706', label: 'C' };
    return { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: '#ef4444', label: 'D' };
  };

  const currentExportParams = {
    query_text: queryText,
    min_score: minScore,
    min_blankness: minBlankness,
    grade: grade,
    wall_material: wallMaterial,
    verified_only: verifiedOnly,
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            <Download size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Phase 12: Search, Filter & Export Studio
              </h2>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '20px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}>
                GIS & Executive Exports
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Filter wall intelligence data across all physical attributes and export in CSV, GeoJSON (QGIS/ArcGIS), or Executive Briefing formats
            </p>
          </div>
        </div>

        {/* Quick Export Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          
          {/* CSV Download Button */}
          <a
            href={getExportCsvUrl(currentExportParams)}
            download="mural_walls.csv"
            className="btn-primary"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              padding: '8px 14px',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.80rem',
            }}
          >
            <FileSpreadsheet size={15} />
            <span>Export CSV (.csv)</span>
          </a>

          {/* GeoJSON Download Button */}
          <a
            href={getExportGeoJsonUrl(currentExportParams)}
            download="mural_walls.geojson"
            className="btn-primary"
            style={{
              background: 'linear-gradient(135deg, #38bdf8, #0284c7)',
              padding: '8px 14px',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.80rem',
            }}
          >
            <Globe size={15} />
            <span>Export GeoJSON (.geojson)</span>
          </a>

          {/* Executive Dossier Button */}
          <button
            onClick={handleOpenDossier}
            className="btn-primary"
            style={{
              background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.80rem',
            }}
          >
            <FileText size={15} />
            <span>Executive Briefing</span>
          </button>
        </div>
      </div>

      {/* Multi-Parameter Search & Filter Studio Bar */}
      <div style={{
        background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        marginBottom: '20px',
      }}>
        
        {/* Full-Text Search Input */}
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '10px' }} />
          <input
            type="text"
            placeholder="Search by keywords, street address, wall material, or notes..."
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '0.84rem',
            }}
          />
        </div>

        {/* Facet Filters Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}>
          {/* Min Score Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Minimum Score:</span>
              <strong style={{ color: '#38bdf8' }}>{minScore} / 100</strong>
            </div>
            <input
              type="range"
              min="0"
              max="95"
              step="5"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
            />
          </div>

          {/* Min Blankness Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Min Blankness %:</span>
              <strong style={{ color: '#10b981' }}>{minBlankness}%</strong>
            </div>
            <input
              type="range"
              min="0"
              max="95"
              step="5"
              value={minBlankness}
              onChange={(e) => setMinBlankness(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
            />
          </div>

          {/* Grade Selector */}
          <div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Grade Tier:</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {['ALL', 'A', 'B', 'C'].map((g) => (
                <button
                  key={g}
                  onClick={() => setGrade(g)}
                  style={{
                    background: grade === g ? 'rgba(56, 189, 248, 0.2)' : 'none',
                    border: grade === g ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    color: grade === g ? '#38bdf8' : 'var(--text-secondary)',
                    padding: '3px 8px',
                    fontSize: '0.72rem',
                    fontWeight: grade === g ? 700 : 500,
                    cursor: 'pointer',
                    flex: 1,
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Material Selector */}
          <div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Surface Material:</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {['ALL', 'brick', 'concrete', 'stucco'].map((m) => (
                <button
                  key={m}
                  onClick={() => setWallMaterial(m)}
                  style={{
                    background: wallMaterial === m ? 'rgba(16, 185, 129, 0.2)' : 'none',
                    border: wallMaterial === m ? '1px solid #10b981' : '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    color: wallMaterial === m ? '#34d399' : 'var(--text-secondary)',
                    padding: '3px 6px',
                    fontSize: '0.72rem',
                    textTransform: 'capitalize',
                    fontWeight: wallMaterial === m ? 700 : 500,
                    cursor: 'pointer',
                    flex: 1,
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Hard Material Exclusion Pills */}
          <div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Hard Material Exclusions:
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
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
                      padding: '3px 6px',
                      fontSize: '0.70rem',
                      fontWeight: isExcluded ? 700 : 500,
                      cursor: 'pointer',
                      flex: 1,
                      textDecoration: isExcluded ? 'line-through' : 'none',
                    }}
                  >
                    {isExcluded ? `✕ Excluded` : `Exclude ${mat}`}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Toggle Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', fontSize: '0.76rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              style={{ accentColor: '#10b981', cursor: 'pointer' }}
            />
            <span>OpenAI Sanity-Checked Walls Only</span>
          </label>

          <span style={{ color: '#38bdf8', fontWeight: 700 }}>
            Found {results.length} Matching Mural Targets
          </span>
        </div>

      </div>

      {/* Results Table / Grid */}
      {results.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          border: '1px dashed var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-secondary)',
          fontSize: '0.88rem',
        }}>
          <Filter size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto', display: 'block' }} />
          No wall targets match your search filters. Adjust minimum score or material above.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
          gap: '16px',
        }}>
          {results.map((c) => {
            const gStyle = getGradeStyle(c.overall_score || 75);
            return (
              <div
                key={c.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Photo Thumbnail */}
                <div style={{ position: 'relative', width: '100%', height: '150px', background: '#0f172a' }}>
                  <img
                    src={c.primary_view_preview_url || '/placeholder.jpg'}
                    alt={`Candidate ${c.id}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy"
                    onError={e => { e.currentTarget.src = IMG_PLACEHOLDER; }}
                />

                  {/* ID Tag */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(8px)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: '#f8fafc',
                  }}>
                    Wall #{c.id}
                  </div>

                  {/* Grade Pill */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: gStyle.bg,
                    border: `1px solid ${gStyle.border}`,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    color: gStyle.text,
                  }}>
                    {gStyle.label} &bull; {c.overall_score.toFixed(1)}
                  </div>
                </div>

                {/* Content & Coordinates */}
                <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', marginBottom: '8px' }}>
                    <span style={{ textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
                      🧱 {c.wall_material || 'Masonry'} &bull; {c.estimated_size || 'Large'}
                    </span>
                    {c.verified_by_openai && (
                      <span style={{ color: '#34d399', fontWeight: 700, fontSize: '0.70rem' }}>
                        ✓ OpenAI Verified
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.70rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Quality: <strong>{c.wall_score?.toFixed(0) || 70}</strong> &bull; Blankness: <strong>{c.blankness_score?.toFixed(0) || 75}%</strong> &bull; Visibility: <strong>{c.visibility_score?.toFixed(0) || 80}%</strong>
                  </div>

                  {/* Footer Actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                    <button
                      onClick={() => handleCopyCoordinates(c)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: copiedId === c.id ? '#34d399' : 'var(--text-secondary)',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {copiedId === c.id ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedId === c.id ? 'Copied GPS!' : `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`}</span>
                    </button>

                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: '#38bdf8',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                    >
                      <span>Maps</span>
                      <ExternalLink size={11} />
                    </a>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Executive Dossier Modal */}
      {dossierModal && (
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
        onClick={() => setDossierModal(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '780px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={20} color="#a78bfa" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {dossierModal.title}
                </h3>
              </div>
              <button
                onClick={() => setDossierModal(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Metrics Overview */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '10px',
              marginBottom: '20px',
            }}>
              <div style={{ background: 'var(--bg-subtle)', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>TOTAL WALLS SCOUTED</div>
                <strong style={{ color: '#38bdf8', fontSize: '1.1rem' }}>{dossierModal.summary_metrics.total_walls_scouted}</strong>
              </div>

              <div style={{ background: 'var(--bg-subtle)', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>AVERAGE COMPOSITE SCORE</div>
                <strong style={{ color: '#34d399', fontSize: '1.1rem' }}>{dossierModal.summary_metrics.average_composite_score} / 100</strong>
              </div>

              <div style={{ background: 'var(--bg-subtle)', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>OPENAI VERIFIED WALLS</div>
                <strong style={{ color: '#a78bfa', fontSize: '1.1rem' }}>{dossierModal.summary_metrics.verified_by_openai_count}</strong>
              </div>
            </div>

            {/* Top 10 Recommended Walls Table */}
            <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
              Top Recommended Wall Targets for Commission
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {dossierModal.top_recommended_walls.map((w) => (
                <div
                  key={w.candidate_id}
                  style={{
                    background: 'var(--bg-subtle)',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.78rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 800, color: '#f59e0b' }}>#{w.rank}</span>
                    <span>Wall #{w.candidate_id} ({w.material})</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span>📍 {w.coordinates.latitude.toFixed(4)}, {w.coordinates.longitude.toFixed(4)}</span>
                    <strong style={{ color: '#34d399' }}>Grade {w.grade} ({w.overall_score.toFixed(1)})</strong>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
              Methodology: {dossierModal.methodology.formula} &bull; Models: {dossierModal.methodology.vision_models.join(', ')}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
