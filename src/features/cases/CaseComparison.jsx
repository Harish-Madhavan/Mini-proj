import React, { useMemo } from 'react';
import { ArrowRight, Scale } from 'lucide-react';
import { useCase } from '../../hooks/useCase';
import { compareCases } from './comparisonMetrics';

const panelStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-md)',
  padding: '1rem'
};

export default function CaseComparison() {
  const { scenarios, activeCaseId, handleSelectCase, setActiveTab } = useCase();
  const summaries = useMemo(() => compareCases(scenarios), [scenarios]);

  function openCase(caseId, tab = 'dashboard') {
    handleSelectCase(caseId);
    setActiveTab(tab);
  }

  return <section className="workflow-page" style={{ display: 'grid', gap: '1rem', padding: '1.25rem' }}>
    <header className="workflow-header" style={{ ...panelStyle, display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <Scale size={20} color="var(--primary-accent)" />
        <div><h2>Case comparison</h2><p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Compare recorded trace coverage and review workload across cases. No case amounts are summed.</p></div>
      </div>
      <strong>{summaries.length} cases</strong>
    </header>

    {summaries.length === 0 ? <div style={panelStyle}>No cases are available to compare.</div> : <div style={{ ...panelStyle, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 850, textAlign: 'left', fontSize: '0.8rem' }}>
        <thead><tr>{['Case', 'Risk score', 'Trace confidence', 'Nodes / flows', 'Endpoints', 'Tx reference coverage', 'Open evidence gaps', 'Open recovery actions', 'Open'].map(label =>
          <th key={label} style={{ padding: '0.65rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>{label}</th>
        )}</tr></thead>
        <tbody>{summaries.map(summary => <tr key={summary.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <td style={{ padding: '0.65rem', minWidth: 160 }}>
            <button type="button" className="btn-quiet" onClick={() => openCase(summary.id)} style={{ textAlign: 'left' }}>{summary.title}</button>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{summary.traceType}</div>
          </td>
          <td style={{ padding: '0.65rem' }}>{summary.riskScore == null ? 'Not recorded' : `${summary.riskScore}/100`}</td>
          <td style={{ padding: '0.65rem' }}>{summary.traceConfidence == null ? 'Not recorded' : `${Math.round(summary.traceConfidence * 100)}%`}</td>
          <td style={{ padding: '0.65rem' }}>{summary.nodeCount} / {summary.flowCount}</td>
          <td style={{ padding: '0.65rem' }} title={summary.endpoints.join(', ')}>{summary.endpointCount}</td>
          <td style={{ padding: '0.65rem' }}>{summary.transactionReferenceCount}/{summary.flowCount} ({Math.round(summary.transactionReferenceCoverage * 100)}%)</td>
          <td style={{ padding: '0.65rem' }}>{summary.evidenceGapCount} ({summary.highPriorityGapCount} high)</td>
          <td style={{ padding: '0.65rem' }}>{summary.openRecoveryActionCount}/{summary.recoveryActionCount}</td>
          <td style={{ padding: '0.65rem' }}>
            <button type="button" className="btn-quiet" aria-label={`Open ${summary.title} in trace`} onClick={() => openCase(summary.id, 'trace')}>
              <ArrowRight size={13} /> {summary.id === activeCaseId ? 'Trace' : 'Open'}
            </button>
          </td>
        </tr>)}</tbody>
      </table>
    </div>}
    <aside style={{ ...panelStyle, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
      Trace reference coverage counts links with a recorded transaction ID. Evidence gaps are review prompts. Scores and counts do not establish attribution, ownership, or case priority.
    </aside>
  </section>;
}
