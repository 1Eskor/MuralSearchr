import React, { useState, useEffect, useRef } from 'react';
import { Play, CheckCircle2, AlertCircle, Loader2, Sparkles, Image as ImageIcon, MapPin } from 'lucide-react';
import { triggerDryRun, subscribeToJobEvents, fetchJob } from '../services/api';

export default function JobMonitor({ onPipelineFinish }) {
  const [activeJob, setActiveJob] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [jobLogs, setJobLogs] = useState([]);
  const [results, setResults] = useState(null);
  const pollTimerRef = useRef(null);
  const sseUnsubRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (sseUnsubRef.current) sseUnsubRef.current();
    };
  }, []);

  const handleJobUpdate = (updatedJob) => {
    setActiveJob(updatedJob);
    if (updatedJob.logs && updatedJob.logs.length > 0) {
      setJobLogs(updatedJob.logs);
    }
    if (updatedJob.status === 'completed') {
      setIsRunning(false);
      setResults(updatedJob.result_summary);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (onPipelineFinish) onPipelineFinish();
    } else if (updatedJob.status === 'failed' || updatedJob.status === 'cancelled') {
      setIsRunning(false);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }
  };

  const startTestPipeline = async () => {
    setIsRunning(true);
    setResults(null);
    setJobLogs([]);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (sseUnsubRef.current) sseUnsubRef.current();

    try {
      const job = await triggerDryRun();
      setActiveJob(job);
      
      // 1. Subscribe to real-time Server-Sent Events
      sseUnsubRef.current = subscribeToJobEvents(
        job.job_id,
        (updatedJob) => handleJobUpdate(updatedJob),
        (err) => console.warn('SSE stream notice, relying on active polling:', err)
      );

      // 2. Dual Polling Fallback (ensures rapid UI sync regardless of browser buffering)
      pollTimerRef.current = setInterval(async () => {
        try {
          const freshJob = await fetchJob(job.job_id);
          handleJobUpdate(freshJob);
        } catch (e) {
          console.error('Polling error:', e);
        }
      }, 400);

    } catch (e) {
      console.error('Failed to trigger dry-run', e);
      setIsRunning(false);
    }
  };

  const progress = activeJob?.progress || 0;
  const status = activeJob?.status || 'idle';
  const currentStep = activeJob?.current_step || 'Ready to test pipeline';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '24px' }}>
      <div className="glass-card" style={{ padding: '24px' }}>
        
        {/* Header & Action Button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                Phase 1 Pipeline Test & Job Monitor
              </h2>
              {status === 'running' && (
                <span className="badge badge-cyan" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Loader2 size={12} className="animate-spin" /> In Progress
                </span>
              )}
              {status === 'completed' && (
                <span className="badge badge-emerald">Verified</span>
              )}
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Tests all 5 decoupled stages: Geodata sampling → Image download → Disk Cache → CLIP ranking → VLM Scoring
            </p>
          </div>

          <button
            onClick={startTestPipeline}
            disabled={isRunning}
            className="btn-primary"
          >
            {isRunning ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Running Test ({Math.round(progress)}%)...</span>
              </>
            ) : (
              <>
                <Play size={16} />
                <span>Run Phase 1 Dry-Run Pipeline</span>
              </>
            )}
          </button>
        </div>

        {/* Real-Time Progress Bar */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Step {activeJob?.current_step_index || 0} of {activeJob?.total_steps || 5}: <strong style={{ color: 'var(--text-primary)' }}>{currentStep}</strong>
            </span>
            <span style={{ fontWeight: 700, color: '#38bdf8' }}>{Math.round(progress)}%</span>
          </div>
          
          <div style={{ height: '10px', width: '100%', backgroundColor: 'var(--border-subtle)', borderRadius: '6px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #6366f1, #06b6d4)',
                boxShadow: '0 0 15px rgba(6, 182, 212, 0.5)',
                transition: 'width 0.3s ease-out'
              }}
            />
          </div>
        </div>

        {/* Live SSE Step Log Terminal */}
        {jobLogs.length > 0 && (
          <div style={{
            background: 'var(--bg-terminal, #0f172a)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            maxHeight: '160px',
            overflowY: 'auto',
            marginBottom: '20px'
          }}>
            {jobLogs.map((log, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '6px', color: '#cbd5e1' }}>
                <span style={{ color: 'var(--text-muted)' }}>{log.timestamp.split('T')[1]?.slice(0, 8)}</span>
                <span style={{ color: '#818cf8', fontWeight: 600 }}>[{log.step}]</span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Candidate Results Display */}
        {results && results.candidates && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Sparkles size={16} color="#38bdf8" />
                <span>Test Candidate Discoveries ({results.candidates.length} Walls Scored)</span>
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Completed in <strong>{results.duration_seconds}s</strong> on <strong>{results.device_used?.toUpperCase()}</strong>
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {results.candidates.map((cand, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-subtle, rgba(255, 255, 255, 0.03))',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span className="badge badge-cyan" style={{ fontSize: '0.72rem' }}>
                        Rank #{idx + 1} &bull; {cand.estimated_size?.toUpperCase()}
                      </span>
                      <div style={{
                        fontSize: '1.15rem',
                        fontWeight: 800,
                        color: cand.overall_score >= 80 ? '#10b981' : '#f59e0b',
                        background: cand.overall_score >= 80 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        border: `1px solid ${cand.overall_score >= 80 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                      }}>
                        {cand.overall_score} / 100
                      </div>
                    </div>

                    <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontStyle: 'italic', marginBottom: '12px' }}>
                      "{cand.reason}"
                    </p>

                    {/* Breakdown Scores */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <div>Wall Quality: <strong style={{ color: 'var(--text-primary)' }}>{cand.wall_score}</strong></div>
                      <div>Blankness: <strong style={{ color: 'var(--text-primary)' }}>{cand.blankness_score}</strong></div>
                      <div>Visibility: <strong style={{ color: 'var(--text-primary)' }}>{cand.visibility_score}</strong></div>
                      <div>Access: <strong style={{ color: 'var(--text-primary)' }}>{cand.access_score}</strong></div>
                    </div>
                  </div>

                  <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Image ID: {cand.image_id.slice(0, 14)}...</span>
                    <span style={{ color: '#38bdf8', fontWeight: 600 }}>Cached & Verified</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
