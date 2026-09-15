import React, { useMemo, useState } from 'react';
import { Network, Link2, ChevronDown, ChevronRight } from 'lucide-react';
import { useCase } from '../hooks/useCase';
import { correlateCases } from '../utils/syndicateAnalysis';

const ROLE_LABELS = {
  suspect: 'start',
  hop: 'step',
  receiver: 'end',
  mixer: 'mixing',
};

function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

const VERDICT_STYLE = {
  SAME_OPERATOR_LIKELY: { color: '#ef4444', label: 'Likely shared operator' },
  SHARED_INFRASTRUCTURE: { color: '#f59e0b', label: 'Shared addresses' },
  WEAK_OVERLAP: { color: 'var(--text-secondary)', label: 'Weak overlap' },
};

export default function SyndicateMap() {
  const { scenarios, activeCaseId, handleSelectCase } = useCase();
  const [expandedPair, setExpandedPair] = useState(null);

  const correlation = useMemo(() => correlateCases(scenarios), [scenarios]);
  const caseById = useMemo(() => new Map(scenarios.map(c => [c.id, c])), [scenarios]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Network size={18} /> Linked cases
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
          Cases that reuse the same addresses are probably run by the same people.
        </p>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.9rem', fontSize: '0.8rem' }}>
          <span><strong style={{ fontSize: '1.1rem' }}>{correlation.caseCount}</strong> <span style={{ color: 'var(--text-muted)' }}>cases</span></span>
          <span><strong style={{ fontSize: '1.1rem' }}>{correlation.linkedCaseCount}</strong> <span style={{ color: 'var(--text-muted)' }}>linked</span></span>
          <span><strong style={{ fontSize: '1.1rem' }}>{correlation.components.length}</strong> <span style={{ color: 'var(--text-muted)' }}>groups</span></span>
        </div>
      </div>

      {correlation.components.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {correlation.components.map(comp => (
            <div key={comp.syndicateId} className="glass-panel" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <span className="badge-pill badge-pill-danger">{comp.syndicateId}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {comp.caseIds.length} linked cases
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {comp.caseIds.map(id => (
                  <button
                    key={id}
                    onClick={() => handleSelectCase(id)}
                    className="btn btn-outline"
                    title={`Open ${caseById.get(id)?.title || id}`}
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', borderColor: id === activeCaseId ? 'var(--primary)' : undefined }}
                  >
                    {caseById.get(id)?.title || id}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
          <Link2 size={15} /> Links
        </h4>
        {correlation.pairs.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            No shared addresses across these {correlation.caseCount} cases. Trace more cases to find links.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {correlation.pairs.map(pair => {
              const key = `${pair.caseA}<>${pair.caseB}`;
              const verdict = VERDICT_STYLE[pair.verdict] || VERDICT_STYLE.WEAK_OVERLAP;
              const open = expandedPair === key;
              return (
                <div key={key} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.75rem 0.9rem', backgroundColor: 'rgba(5,8,16,0.5)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <button onClick={() => handleSelectCase(pair.caseA)} className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}>
                      {(caseById.get(pair.caseA)?.title || pair.caseA).slice(0, 28)}
                    </button>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>⟷</span>
                    <button onClick={() => handleSelectCase(pair.caseB)} className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}>
                      {(caseById.get(pair.caseB)?.title || pair.caseB).slice(0, 28)}
                    </button>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                      {pair.sharedCount} shared · {pair.linkScore}
                    </span>
                    <span className="badge-pill" style={{ color: verdict.color, border: `1px solid ${verdict.color}55`, backgroundColor: `${verdict.color}14` }}>
                      {verdict.label}
                    </span>
                    <button
                      onClick={() => setExpandedPair(open ? null : key)}
                      className="btn"
                      aria-expanded={open}
                      aria-label={open ? 'Hide shared addresses' : 'Show shared addresses'}
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                    >
                      {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      {open ? 'Hide' : 'Addresses'}
                    </button>
                  </div>
                  <div style={{ height: '4px', borderRadius: '2px', backgroundColor: 'rgba(255,255,255,0.06)', marginTop: '0.6rem', overflow: 'hidden' }}>
                    <div style={{ width: `${pair.linkScore}%`, height: '100%', backgroundColor: verdict.color }} />
                  </div>
                  {open && (
                    <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {pair.shared.map(s => (
                        <div key={s.address} className="mono-addr" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                          {s.address}
                          <span style={{ color: 'var(--text-muted)' }}> · {s.rolesA.map(roleLabel).join('/') || '?'} ⟷ {s.rolesB.map(roleLabel).join('/') || '?'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
