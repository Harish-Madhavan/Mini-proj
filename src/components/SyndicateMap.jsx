import React, { useMemo, useState } from 'react';
import { Network, Link2, ChevronDown, ChevronRight } from 'lucide-react';
import { useCase } from '../hooks/useCase';
import { correlateCases } from '../utils/syndicateAnalysis';
import EmptyState from './EmptyState';

const ROLE_LABELS = {
  suspect: 'start',
  hop: 'step',
  receiver: 'end',
  mixer: 'mixing',
};

function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

const VERDICT_LABEL = {
  SAME_OPERATOR_LIKELY: 'Likely shared operator',
  SHARED_INFRASTRUCTURE: 'Shared addresses',
  WEAK_OVERLAP: 'Weak overlap',
};

export default function SyndicateMap() {
  const { scenarios, activeCaseId, handleSelectCase } = useCase();
  const [expandedPair, setExpandedPair] = useState(null);

  const correlation = useMemo(() => correlateCases(scenarios), [scenarios]);
  const caseById = useMemo(() => new Map(scenarios.map(c => [c.id, c])), [scenarios]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Network size={15} style={{ color: 'var(--text-muted)' }} /> Linked cases
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
          Cases reusing the same addresses are probably run by the same people.
        </p>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.9rem', fontSize: '0.82rem' }}>
          <span><strong style={{ fontSize: '1.05rem', fontWeight: 600 }}>{correlation.caseCount}</strong> <span style={{ color: 'var(--text-muted)' }}>cases</span></span>
          <span><strong style={{ fontSize: '1.05rem', fontWeight: 600 }}>{correlation.linkedCaseCount}</strong> <span style={{ color: 'var(--text-muted)' }}>linked</span></span>
          <span><strong style={{ fontSize: '1.05rem', fontWeight: 600 }}>{correlation.components.length}</strong> <span style={{ color: 'var(--text-muted)' }}>groups</span></span>
        </div>
      </div>

      {correlation.components.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {correlation.components.map(comp => (
            <div key={comp.syndicateId} className="glass-panel" style={{ padding: '1.1rem 1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span className="mono-addr" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{comp.syndicateId}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {comp.caseIds.length} cases
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {comp.caseIds.map(id => (
                  <button
                    key={id}
                    onClick={() => handleSelectCase(id)}
                    className={id === activeCaseId ? 'btn btn-primary' : 'btn-quiet'}
                    title={`Open ${caseById.get(id)?.title || id}`}
                    style={{ fontSize: '0.8rem' }}
                  >
                    {caseById.get(id)?.title || id}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
          <Link2 size={14} style={{ color: 'var(--text-muted)' }} /> Links
        </h4>
        {correlation.pairs.length === 0 ? (
          <EmptyState icon={<Network size={28} style={{ opacity: 0.6 }} />}>
            No shared addresses across these {correlation.caseCount} cases. Trace more cases to find links.
          </EmptyState>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {correlation.pairs.map(pair => {
              const key = `${pair.caseA}<>${pair.caseB}`;
              const verdict = VERDICT_LABEL[pair.verdict] || VERDICT_LABEL.WEAK_OVERLAP;
              const open = expandedPair === key;
              return (
                <div key={key} style={{ padding: '0.8rem 0', borderBottom: '1px solid var(--border-soft)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button onClick={() => handleSelectCase(pair.caseA)} className="btn-quiet" style={{ fontSize: '0.82rem' }}>
                      {(caseById.get(pair.caseA)?.title || pair.caseA).slice(0, 28)}
                    </button>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>·</span>
                    <button onClick={() => handleSelectCase(pair.caseB)} className="btn-quiet" style={{ fontSize: '0.82rem' }}>
                      {(caseById.get(pair.caseB)?.title || pair.caseB).slice(0, 28)}
                    </button>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {pair.sharedCount} shared · {pair.linkScore} · {verdict}
                    </span>
                    <button
                      onClick={() => setExpandedPair(open ? null : key)}
                      className="btn-quiet"
                      aria-expanded={open}
                      aria-label={open ? 'Hide shared addresses' : 'Show shared addresses'}
                      style={{ fontSize: '0.76rem' }}
                    >
                      {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      {open ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {open && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {pair.shared.map(s => (
                        <div key={s.address} className="mono-addr" style={{ fontSize: '0.76rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                          {s.address}
                          <span> · {s.rolesA.map(roleLabel).join('/') || '?'} / {s.rolesB.map(roleLabel).join('/') || '?'}</span>
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
