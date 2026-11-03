import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, BriefcaseBusiness, Plus, ShieldCheck } from 'lucide-react';
import { useCase } from '../../hooks/useCase';
import { buildRecoveryLeads, formatLeadAmount, getRecoveryActionTransitions, RECOVERY_ACTION_STATES } from './recoveryLeads';

const ACTION_TYPES = ['Prepare preservation request', 'Submit lawful information request', 'Awaiting response'];
function panelStyle() {
  return { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem' };
}

export default function AssetRecovery() {
  const { activeCase, scenarios, addRecoveryAction, updateRecoveryAction } = useCase();
  const [drafts, setDrafts] = useState({});
  const derived = useMemo(() => buildRecoveryLeads(activeCase), [activeCase]);
  const leads = derived.map(lead => {
    const saved = (activeCase.recoveryLeads || []).find(item => item.id === lead.id);
    const actions = saved?.actions || [];
    const recoveredAction = actions.find(action => action.state === RECOVERY_ACTION_STATES.RECOVERY_CONFIRMED);
    return {
      ...lead,
      ...(saved || {}),
      actions,
      evidence: recoveredAction
        ? { ...lead.evidence, confirmedRecovery: { status: 'confirmed', evidence: recoveredAction.outcomeEvidence } }
        : lead.evidence
    };
  }).sort((a, b) => b.rankScore - a.rankScore || b.attributedSats - a.attributedSats);
  const casesWithLeads = scenarios.filter(item => buildRecoveryLeads(item).length).length;

  function addAction(lead) {
    const draft = drafts[lead.id] || {};
    const action = {
      id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: draft.type || ACTION_TYPES[0],
      state: RECOVERY_ACTION_STATES.PLANNED,
      evidence: draft.evidence || '',
      note: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    addRecoveryAction(lead.id, action);
    setDrafts(previous => ({ ...previous, [lead.id]: { ...previous[lead.id], evidence: '', note: '' } }));
  }

  return <section style={{ display: 'grid', gap: '1rem', paddingTop: '1.25rem' }}>
    <header style={{ ...panelStyle(), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <BriefcaseBusiness size={20} color="var(--primary-accent)" />
        <div><h2 style={{ fontSize: '1.15rem' }}>Asset recovery leads</h2><p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Prioritized destinations from the active case trace</p></div>
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{leads.length} leads · {casesWithLeads} cases with traceable funds</div>
    </header>

    <aside style={{ ...panelStyle(), borderColor: 'rgba(59,130,246,0.3)', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
      <ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: '0.35rem', color: 'var(--primary-accent)' }} />
      Trace amounts and taint scores are analytical estimates. Destination labels and service contacts are shown only when accompanied by explicit verified evidence; transaction patterns alone do not identify an address owner.
    </aside>

    {!leads.length ? <div style={{ ...panelStyle(), textAlign: 'center', color: 'var(--text-secondary)', padding: '2.5rem 1rem' }}>
      <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>No recovery candidates in this case</p>
      <p style={{ fontSize: '0.83rem', marginTop: '0.35rem' }}>Select a case with traced value-bearing flows to generate evidence-qualified leads.</p>
    </div> : leads.map((lead, index) => <article key={lead.id} style={{ ...panelStyle(), display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(59,130,246,0.12)', color: 'var(--primary-accent)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>#{index + 1}</div>
          <div><h3 style={{ fontSize: '0.97rem' }}>{lead.label}</h3><code style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', overflowWrap: 'anywhere' }}>{lead.address}</code></div>
        </div>
        <div style={{ textAlign: 'right' }}><strong style={{ color: 'var(--primary-accent)' }}>{lead.priority} priority</strong><div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Rank score {lead.rankScore}/100</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
        <Metric icon={<ArrowDownLeft size={14} />} label="Tainted value reaching destination" value={formatLeadAmount(lead.attributedSats, lead.currency)} />
        <Metric icon={<ArrowUpRight size={14} />} label="Subsequently moved to this lead" value={formatLeadAmount(lead.movedSats, lead.currency)} />
        <Metric label="Verified available balance" value={lead.availableSats ? formatLeadAmount(lead.availableSats, lead.currency) : 'Not established'} />
        <Metric label="Recoverability evidence" value={lead.recoverability.replaceAll('_', ' ')} detail={lead.recoverability === 'unspent_confirmed' ? 'Output reported unspent by chain data' : 'Current control or balance not established'} />
        <Metric label="Last observed transaction" value={lead.lastObserved} />
        <Metric label="Destination address type" value={lead.destinationType} detail={lead.destinationEvidence ? `Evidence: ${lead.destinationEvidence.source}` : 'Not established from verified evidence'} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        <span style={chip}>On-chain trace confidence: {Math.round(lead.scoreFactors.evidenceBreakdown.onChain * 100)}%</span>
        <span style={chip}>Attribution hypothesis confidence: {Math.round(lead.scoreFactors.evidenceBreakdown.attribution * 100)}%</span>
        <span style={chip}>Value factor: {Math.round(lead.scoreFactors.value * 100)}%</span>
        <span style={chip}>Recency factor: {Math.round(lead.scoreFactors.recency * 100)}%</span>
        <span style={chip}>Verified service contact: {lead.verifiedContact ? 'Available' : 'Not established'}</span>
        {lead.evidence.attributionHypothesis.source && <span style={chip}>Attribution source: {lead.evidence.attributionHypothesis.source}</span>}
        {lead.lastTransactionId && <span style={chip}>Transaction: {lead.lastTransactionId}</span>}
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Recovery outcome: {lead.evidence.confirmedRecovery.status === 'not_confirmed' ? 'Not confirmed' : lead.evidence.confirmedRecovery.status}. Trace attribution is a hypothesis; only transaction evidence is on-chain.</div>
      {lead.deduplicationAmbiguous && <div style={{ color: '#fbbf24', fontSize: '0.72rem' }}>Some flow records lack transaction IDs. Overlap cannot be reliably deduplicated, so the attributed amount may include duplicate records.</div>}

      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.9rem', display: 'grid', gap: '0.7rem' }}>
        <h4 style={{ fontSize: '0.83rem' }}>Follow-up actions <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({lead.actions.length})</span></h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 1fr) 2fr auto', gap: '0.5rem' }}>
          <select className="select-field" aria-label={`Action type for ${lead.label}`} value={drafts[lead.id]?.type || ACTION_TYPES[0]} onChange={event => setDrafts(prev => ({ ...prev, [lead.id]: { ...prev[lead.id], type: event.target.value } }))}>{ACTION_TYPES.map(type => <option key={type}>{type}</option>)}</select>
          <input className="input-field" aria-label={`Action evidence for ${lead.label}`} placeholder="Evidence reference or case note" value={drafts[lead.id]?.evidence || ''} onChange={event => setDrafts(prev => ({ ...prev, [lead.id]: { ...prev[lead.id], evidence: event.target.value } }))} />
          <button className="btn" type="button" onClick={() => addAction(lead)}><Plus size={14} /> Add action</button>
        </div>
        {lead.actions.map(action => <div key={action.id} style={{ ...panelStyle(), padding: '0.75rem', display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 170px minmax(160px, 1fr)', gap: '0.65rem', alignItems: 'center' }}>
          <div><strong style={{ fontSize: '0.78rem' }}>{action.type}</strong><div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Added {new Date(action.createdAt).toLocaleString()}</div></div>
          <select className="select-field" aria-label={`Status for ${action.type}`} value={action.state || RECOVERY_ACTION_STATES.PLANNED} onChange={event => updateRecoveryAction(lead.id, action.id, { state: event.target.value })}>
            {[action.state || RECOVERY_ACTION_STATES.PLANNED, ...getRecoveryActionTransitions(action)].map(state => <option key={state} value={state}>{state.replaceAll('_', ' ')}</option>)}
          </select>
          <input className="input-field" aria-label={`Supporting evidence for ${action.type}`} placeholder="Supporting evidence" value={action.evidence || ''} onChange={event => updateRecoveryAction(lead.id, action.id, { evidence: event.target.value })} />
          {getRecoveryActionTransitions(action).includes(RECOVERY_ACTION_STATES.RECOVERY_CONFIRMED) && <input className="input-field" aria-label={`Recovery outcome evidence for ${action.type}`} placeholder="Recovery outcome evidence (required to confirm)" value={action.outcomeEvidence || ''} onChange={event => updateRecoveryAction(lead.id, action.id, { outcomeEvidence: event.target.value })} />}
          {action.history?.length > 0 && <div style={{ gridColumn: '1 / -1', color: 'var(--text-muted)', fontSize: '0.7rem' }}>History: {action.history.map(entry => `${entry.from.replaceAll('_', ' ')} → ${entry.to.replaceAll('_', ' ')} (${new Date(entry.timestamp).toLocaleString()})`).join(' · ')}</div>}
        </div>)}
      </div>
    </article>)}
  </section>;
}

function Metric({ icon, label, value, detail }) {
  return <div style={{ padding: '0.7rem', background: 'var(--bg-inset)', borderRadius: 8 }}><div style={{ color: 'var(--text-muted)', fontSize: '0.69rem', display: 'flex', alignItems: 'center', gap: 5 }}>{icon}{label}</div><strong style={{ display: 'block', marginTop: 4, fontSize: '0.82rem', overflowWrap: 'anywhere' }}>{value}</strong>{detail && <div style={{ color: 'var(--text-muted)', fontSize: '0.67rem', marginTop: 3 }}>{detail}</div>}</div>;
}

const chip = { border: '1px solid var(--border-color)', borderRadius: 999, padding: '0.25rem 0.55rem' };
