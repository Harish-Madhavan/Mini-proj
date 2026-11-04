import React, { useMemo, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { useCase } from '../../hooks/useCase';
import { buildInvestigationTimeline, filterTimeline } from './timelineEvents';

const panelStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-md)',
  padding: '1rem'
};

export default function InvestigationTimeline() {
  const { scenarios, activeCase } = useCase();
  const [caseId, setCaseId] = useState(activeCase?.id || '');
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const selectedCase = scenarios.find(item => item.id === caseId) || activeCase;
  const entries = useMemo(() => buildInvestigationTimeline(selectedCase), [selectedCase]);
  const visibleEntries = useMemo(() => filterTimeline(entries, { query, kind }), [entries, query, kind]);
  const kinds = [...new Set(entries.map(entry => entry.kind))];

  return <section className="workflow-page" style={{ display: 'grid', gap: '1rem', padding: '1.25rem' }}>
    <header className="workflow-header" style={{ ...panelStyle, display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <Clock3 size={20} color="var(--primary-accent)" />
        <div><h2>Investigation timeline</h2><p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Recorded trace references, case notes, evidence reviews, and recovery actions.</p></div>
      </div>
      <strong>{visibleEntries.length} events</strong>
    </header>

    <div style={{ ...panelStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.6rem' }}>
      <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.76rem' }}>Case
        <select className="select-field" value={selectedCase?.id || ''} onChange={event => setCaseId(event.target.value)} aria-label="Timeline case">
          {scenarios.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.76rem' }}>Event type
        <select className="select-field" value={kind} onChange={event => setKind(event.target.value)} aria-label="Filter timeline by event type">
          <option value="all">All event types</option>
          {kinds.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.76rem' }}>Search events
        <input className="input-field" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search text or reference" aria-label="Search timeline events" />
      </label>
    </div>

    {!visibleEntries.length ? <div style={{ ...panelStyle, color: 'var(--text-secondary)' }}>
      {entries.length ? 'No timeline events match these filters.' : 'No dated or referenced activity is recorded for this case yet.'}
    </div> : <ol aria-label="Investigation events" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.55rem' }}>
      {visibleEntries.map(entry => <li key={entry.id} style={{ ...panelStyle, display: 'grid', gridTemplateColumns: 'minmax(150px, 0.6fr) 1fr', gap: '0.4rem 1rem' }}>
        <time dateTime={entry.time == null ? undefined : new Date(entry.time).toISOString()} style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          {entry.time == null ? 'Time not recorded' : new Date(entry.time).toLocaleString()}
        </time>
        <div><strong style={{ fontSize: '0.78rem' }}>{entry.kind}</strong><p style={{ marginTop: '0.2rem', overflowWrap: 'anywhere' }}>{entry.summary}</p>
          {entry.reference && <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', overflowWrap: 'anywhere' }}>Reference: {entry.reference}</div>}
        </div>
      </li>)}
    </ol>}

    <aside style={{ ...panelStyle, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
      This view uses timestamps and references already stored in the case. Events without a parseable timestamp are labeled accordingly; this is not a tamper-proof audit log.
    </aside>
  </section>;
}
