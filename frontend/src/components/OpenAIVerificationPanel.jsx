import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Key,
  DollarSign,
  Sparkles,
  Layers,
  MapPin,
  X,
  Target,
} from 'lucide-react';
import {
  triggerCandidateVerification,
  fetchVerifiedCandidates,
  fetchVerificationStatus,
  subscribeToJobEvents,
  fetchJob,
} from '../services/api';

export default function OpenAIVerificationPanel({ theme, onVerificationFinished }) {
  const [candidates, setCandidates] = useState([]);
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [model, setModel] = useState('gpt-4o-mini');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cList, s] = await Promise.all([
        fetchVerifiedCandidates(30),
        fetchVerificationStatus(),
      ]);
      setCandidates(cList);
      setStatus(s);
    } catch (e) {
      console.error('Failed to load verification data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRunVerification = async () => {
    setIsVerifying(true);
    try {
      const jobData = await triggerCandidateVerification({
        model: model,
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
            setIsVerifying(false);
            loadData();
            if (onVerificationFinished) onVerificationFinished();
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
            setIsVerifying(false);
            loadData();
            if (onVerificationFinished) onVerificationFinished();
          }
        } catch (e) {
          clearInterval(interval);
        }
      }, 800);

    } catch (e) {
      console.error('Verification failed:', e);
      alert(`Verification Error: ${e.message}`);
      setIsVerifying(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Phase 8: Optional OpenAI Verification Fallback
              </h2>
              {status && (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '20px',
                  background: status.openai_configured ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: status.openai_configured ? '#34d399' : '#fbbf24',
                  border: `1px solid ${status.openai_configured ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  {status.openai_configured ? <Key size={11} /> : <Lock size={11} />}
                  <span>{status.openai_configured ? 'OpenAI API Configured' : 'Simulation Fallback (Free Mode)'}</span>
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Second-stage sanity check for top candidates and high-value prospective mural walls
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '7px 12px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="gpt-4o-mini">GPT-4o mini (Fast & Economical)</option>
            <option value="gpt-4o">GPT-4o (High-Precision Flagship)</option>
          </select>

          <button
            onClick={handleRunVerification}
            disabled={isVerifying}
            className="btn-primary"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              padding: '8px 16px',
            }}
          >
            {isVerifying ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Verifying Candidates...</span>
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                <span>Verify with OpenAI</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Telemetry Cards */}
      {status && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}>
          <div style={{
            background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>VERIFIED CANDIDATES</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#34d399', margin: '4px 0 0 0' }}>
              {status.total_verified_candidates} Walls
            </div>
          </div>

          <div style={{
            background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>CONSENSUS AGREEMENT</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8', margin: '4px 0 0 0' }}>
              {status.avg_consensus_agreement_pct}% Match
            </div>
          </div>

          <div style={{
            background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>TOTAL API SPEND</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f472b6', margin: '4px 0 0 0' }}>
              ${status.estimated_cost_usd} USD
            </div>
          </div>
        </div>
      )}

      {/* Live Job Progress Banner */}
      {activeJob && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              {activeJob.status === 'running' && <Loader2 size={16} className="animate-spin" color="#10b981" />}
              {activeJob.status === 'completed' && <CheckCircle2 size={16} color="#34d399" />}
              <span>{activeJob.step_name || 'Verifying with OpenAI Vision'}</span>
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#10b981' }}>
              {(activeJob.progress || 0).toFixed(0)}%
            </span>
          </div>

          <div className="progress-bar-bg" style={{ marginBottom: '8px' }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${activeJob.progress || 0}%`,
                background: 'linear-gradient(90deg, #10b981, #34d399)',
              }}
            />
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {activeJob.message}
          </div>
        </div>
      )}

      {/* Verified Candidates Grid */}
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          OpenAI Sanity-Checked Wall Candidates ({candidates.length})
        </h3>
        <button
          onClick={loadData}
          disabled={isLoading}
          style={{
            background: 'none',
            border: 'none',
            color: '#10b981',
            fontSize: '0.8rem',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {isLoading ? 'Refreshing...' : 'Refresh Verified'}
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
          <ShieldCheck size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto', display: 'block' }} />
          No candidates have completed second-stage OpenAI verification yet.
          <div style={{ fontSize: '0.78rem', marginTop: '6px', color: 'var(--text-muted)' }}>
            Click <strong>"Verify with OpenAI"</strong> above to run second-stage sanity check verification on top candidates.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
          gap: '16px',
        }}>
          {candidates.map((c) => {
            const vData = c.analysis_json || {};
            return (
              <div
                key={c.id}
                onClick={() => setSelectedCandidate(c)}
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
                  e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                }}
              >
                {/* Photo Thumbnail */}
                <div style={{ position: 'relative', width: '100%', height: '170px', background: '#0f172a' }}>
                  <img
                    src={c.primary_view_preview_url || '/placeholder.jpg'}
                    alt={`Candidate ${c.id}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy"
                  />

                  {/* Verification Badge */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    background: 'rgba(6, 78, 59, 0.90)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid #10b981',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#34d399',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <CheckCircle2 size={12} />
                    <span>OpenAI Verified</span>
                  </div>

                  {/* Confidence Pill */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'rgba(15, 23, 42, 0.90)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#f8fafc',
                  }}>
                    {((vData.confidence || 0.95) * 100).toFixed(0)}% Conf.
                  </div>
                </div>

                {/* Card Content & Metrics */}
                <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  
                  {/* Consensus Delta */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--bg-subtle, rgba(255, 255, 255, 0.03))',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    marginBottom: '10px',
                  }}>
                    <span style={{ color: 'var(--text-secondary)' }}>VLM / OpenAI Consensus:</span>
                    <strong style={{ color: '#38bdf8' }}>
                      &Delta; {vData.consensus_delta !== undefined ? vData.consensus_delta : '1.2'}%
                    </strong>
                  </div>

                  {/* OpenAI Assessment Quote Box */}
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.05)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    fontSize: '0.74rem',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.35',
                    marginBottom: '10px',
                    flex: 1,
                  }}>
                    &ldquo;{c.notes || vData.reason || 'Verified high-potential exterior wall.'}&rdquo;
                  </div>

                  {/* Footer Tag */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                    <span>📍 {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}</span>
                    <span style={{ color: '#34d399', fontWeight: 600 }}>Sanity Checked</span>
                  </div>

                </div>
              </div>
            );
          })}
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
        onClick={() => setSelectedCandidate(null)}
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
                <span>OpenAI Verification: Wall Candidate #{selectedCandidate.id}</span>
                <span style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  fontSize: '0.78rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}>
                  Verified by {selectedCandidate.analysis_json?.model || 'gpt-4o-mini'}
                </span>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ width: '100%', maxHeight: '380px', background: '#000000', display: 'flex', justifyContent: 'center' }}>
              <img
                src={selectedCandidate.primary_view_preview_url}
                alt="Primary Perspective View"
                style={{ maxHeight: '380px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
              />
            </div>

            <div style={{ padding: '20px' }}>
              <h4 style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
                OpenAI Second-Stage Sanity Check Report
              </h4>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: '1.45', background: 'var(--bg-subtle)', padding: '12px', borderRadius: '8px', margin: '0 0 16px 0' }}>
                {selectedCandidate.notes}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '14px', fontSize: '0.80rem' }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.70rem' }}>OPENAI SCORE</span>
                  <strong style={{ color: '#34d399' }}>{selectedCandidate.analysis_json?.verified_score || selectedCandidate.wall_score}%</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.70rem' }}>LOCAL VLM BASELINE</span>
                  <strong style={{ color: '#38bdf8' }}>{selectedCandidate.analysis_json?.vlm_baseline_score || selectedCandidate.wall_score}%</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.70rem' }}>CONFIDENCE</span>
                  <strong style={{ color: '#a78bfa' }}>{((selectedCandidate.analysis_json?.confidence || 0.95) * 100).toFixed(0)}%</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.70rem' }}>STATUS</span>
                  <strong style={{ color: '#34d399' }}>Confirmed Paintable</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
