import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  Plus,
  ShieldCheck,
  ShieldAlert,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Copy,
  Check,
  Calendar,
  FileText,
  Scale,
  ExternalLink,
  ChevronRight,
  Info
} from 'lucide-react';
import { useCase } from '../../hooks/useCase';
import {
  buildRecoveryLeads,
  formatLeadAmount,
  getRecoveryActionTransitions,
  RECOVERY_ACTION_STATES
} from './recoveryLeads';

const ACTION_TYPES = [
  'Prepare preservation request',
  'Submit lawful information request',
  'Awaiting response'
];

const dateInputValue = value => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
};

export default function AssetRecovery() {
  const {
    activeCase,
    scenarios,
    addRecoveryAction,
    updateRecoveryAction,
    updateRecoveryLeadMetadata
  } = useCase();

  const [drafts, setDrafts] = useState({});
  const [reviewNotes, setReviewNotes] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [recoverabilityFilter, setRecoverabilityFilter] = useState('ALL');

  // Compute and sort recovery leads
  const derived = useMemo(() => buildRecoveryLeads(activeCase), [activeCase]);

  const allLeads = useMemo(() => {
    return derived.map(lead => {
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
    }).sort((a, b) => b.schedulingScore - a.schedulingScore || b.rankScore - a.rankScore || b.attributedSats - a.attributedSats);
  }, [derived, activeCase.recoveryLeads]);

  // Aggregate KPI summary metrics
  const kpis = useMemo(() => {
    const totalAttributed = allLeads.reduce((sum, l) => sum + (l.attributedSats || 0), 0);
    const totalMoved = allLeads.reduce((sum, l) => sum + (l.movedSats || 0), 0);
    const unspentConfirmedSats = allLeads
      .filter(l => l.recoverability === 'unspent_confirmed')
      .reduce((sum, l) => sum + (l.availableSats || 0), 0);
    const totalActions = allLeads.reduce((sum, l) => sum + (l.actions?.length || 0), 0);
    const overdueActions = allLeads.filter(l => l.followUpUrgency === 'overdue').length;

    return {
      totalLeads: allLeads.length,
      totalAttributed,
      totalMoved,
      unspentConfirmedSats,
      totalActions,
      overdueActions,
      currency: activeCase?.currency || 'BTC'
    };
  }, [allLeads, activeCase?.currency]);

  // Filtered leads based on search and filters
  const filteredLeads = useMemo(() => {
    return allLeads.filter(lead => {
      const matchesSearch = !searchQuery.trim() ||
        lead.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (lead.destinationEvidence?.source && lead.destinationEvidence.source.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesPriority =
        priorityFilter === 'ALL' ||
        (priorityFilter === 'OVERDUE' && lead.followUpUrgency === 'overdue') ||
        lead.priority.toUpperCase() === priorityFilter;

      const matchesRecoverability =
        recoverabilityFilter === 'ALL' ||
        lead.recoverability === recoverabilityFilter;

      return matchesSearch && matchesPriority && matchesRecoverability;
    });
  }, [allLeads, searchQuery, priorityFilter, recoverabilityFilter]);

  const casesWithLeads = scenarios.filter(item => buildRecoveryLeads(item).length).length;

  function copyAddress(address, leadId) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(address);
      setCopiedId(leadId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  function addAction(lead) {
    const draft = drafts[lead.id] || {};
    const action = {
      id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: draft.type || ACTION_TYPES[0],
      state: RECOVERY_ACTION_STATES.PLANNED,
      evidence: draft.evidence || '',
      note: '',
      nextFollowUpAt: draft.nextFollowUpAt ? new Date(`${draft.nextFollowUpAt}T23:59:59`).toISOString() : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    addRecoveryAction(lead.id, action);
    setDrafts(previous => ({ ...previous, [lead.id]: { ...previous[lead.id], evidence: '', nextFollowUpAt: '' } }));
  }

  function markReviewed(lead) {
    updateRecoveryLeadMetadata(lead.id, {
      lastReviewedAt: new Date().toISOString(),
      reviewNote: String(reviewNotes[lead.id] || '').trim().slice(0, 500)
    });
    setReviewNotes(previous => ({ ...previous, [lead.id]: '' }));
  }

  return (
    <section className="workflow-page recovery-page" style={{ display: 'grid', gap: '1.25rem', paddingTop: '1.25rem' }}>
      
      {/* HEADER WITH CONTEXT & GLOBAL METRICS */}
      <header className="workflow-header glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(59, 130, 246, 0.15)', display: 'grid', placeItems: 'center', color: 'var(--primary-accent)' }}>
              <BriefcaseBusiness size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Asset Recovery Workstation</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0.2rem 0 0 0' }}>
                Evidence-qualified terminal destinations &amp; statutory follow-up actions for Case: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{activeCase.name || activeCase.id}</span>
              </p>
            </div>
          </div>
          <div className="workflow-summary">
            <span><strong>{allLeads.length}</strong> prioritized leads</span>
            <span><strong>{casesWithLeads}</strong> active cases with traceable funds</span>
          </div>
        </div>

        {/* TOP LEVEL KPI CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
          <KpiCard
            icon={<ArrowDownLeft size={16} color="var(--primary-accent)" />}
            title="Total Attributed Taint"
            value={formatLeadAmount(kpis.totalAttributed, kpis.currency)}
            subtitle="Calculated illicit flow"
          />
          <KpiCard
            icon={<ArrowUpRight size={16} color="#38bdf8" />}
            title="Gross Moved Volume"
            value={formatLeadAmount(kpis.totalMoved, kpis.currency)}
            subtitle="Total downstream flow"
          />
          <KpiCard
            icon={<CheckCircle2 size={16} color="#34d399" />}
            title="Recoverable Unspent"
            value={formatLeadAmount(kpis.unspentConfirmedSats, kpis.currency)}
            subtitle="Confirmed unspent UTXOs"
          />
          <KpiCard
            icon={<Scale size={16} color="#fbbf24" />}
            title="Legal Actions"
            value={`${kpis.totalActions} Recorded`}
            subtitle={kpis.overdueActions > 0 ? `${kpis.overdueActions} overdue for review` : 'All requests on schedule'}
            alert={kpis.overdueActions > 0}
          />
        </div>
      </header>

      {/* STATUTORY & EVIDENTIARY SAFEGUARD BANNER */}
      <aside className="workflow-notice glass-panel" style={{ padding: '0.85rem 1.15rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <ShieldCheck size={18} style={{ color: 'var(--primary-accent)', flexShrink: 0 }} />
        <span>
          <strong>Evidentiary Safeguard:</strong> Taint amounts and recoverability scores are deterministic analytical estimates. Destination typing and service contacts require verified source provenance; transaction heuristics alone do not establish beneficial ownership or control under Section 65B BSA / Section 67 NDPS.
        </span>
      </aside>

      {/* SEARCH & FILTER CONTROLS BAR */}
      <div className="glass-panel" style={{ padding: '0.85rem 1.15rem', display: 'flex', flexWrap: 'wrap', gap: '0.85rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: '1 1 280px', position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', color: 'var(--text-muted)' }} />
          <input
            className="input-field"
            type="text"
            placeholder="Search by address, destination type, or evidence source..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '2.1rem', width: '100%' }}
            aria-label="Filter recovery leads by search term"
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Priority:</span>
          {['ALL', 'HIGH', 'MEDIUM', 'LOW', 'OVERDUE'].map(tier => (
            <button
              key={tier}
              type="button"
              className={`btn btn-sm ${priorityFilter === tier ? 'btn-primary' : 'btn-quiet'}`}
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '6px' }}
              onClick={() => setPriorityFilter(tier)}
            >
              {tier}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Recoverability:</span>
          <select
            className="select-field"
            value={recoverabilityFilter}
            onChange={e => setRecoverabilityFilter(e.target.value)}
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}
            aria-label="Filter by recoverability status"
          >
            <option value="ALL">All States</option>
            <option value="unspent_confirmed">Unspent on-chain</option>
            <option value="spent_at_destination">Spent downstream</option>
            <option value="trace_boundary_unknown">Boundary unknown</option>
          </select>
        </div>
      </div>

      {/* RECOVERY LEADS LIST */}
      {!filteredLeads.length ? (
        <div className="glass-panel" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3.5rem 1rem' }}>
          <ShieldAlert size={36} color="var(--text-muted)" style={{ margin: '0 auto 0.75rem auto' }} />
          <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1rem', margin: '0 0 0.35rem 0' }}>
            No Matching Recovery Leads
          </h3>
          <p style={{ fontSize: '0.83rem', maxWidth: '450px', margin: '0 auto' }}>
            {allLeads.length
              ? 'No recovery candidates match your active search or filter criteria. Reset the filters to view all leads.'
              : 'Select or trace a case with verified value-bearing flows to generate prioritized recovery leads.'}
          </p>
        </div>
      ) : (
        filteredLeads.map((lead, index) => (
          <article className="glass-panel recovery-lead" key={lead.id} style={{ display: 'grid', gap: '1.15rem', padding: '1.25rem' }}>
            
            {/* LEAD HEADER BAR */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: lead.priority === 'High' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.12)',
                  color: lead.priority === 'High' ? '#f87171' : 'var(--primary-accent)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: '0.9rem'
                }}>
                  #{index + 1}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      {lead.label}
                    </h3>
                    {lead.destinationEvidence ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(52, 211, 153, 0.12)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: 999, padding: '0.15rem 0.5rem', fontSize: '0.68rem', fontWeight: 600 }}>
                        <ShieldCheck size={11} /> Sourced Verification
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(148, 163, 184, 0.12)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: 999, padding: '0.15rem 0.5rem', fontSize: '0.68rem', fontWeight: 600 }}>
                        <Info size={11} /> Heuristic Lead
                      </span>
                    )}
                    {lead.recoverability === 'unspent_confirmed' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(59, 130, 246, 0.12)', color: 'var(--primary-accent)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 999, padding: '0.15rem 0.5rem', fontSize: '0.68rem', fontWeight: 600 }}>
                        <CheckCircle2 size={11} /> UTXO Unspent
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                    <code className="mono-addr" style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', background: 'var(--bg-inset)', padding: '0.15rem 0.45rem', borderRadius: 4 }}>
                      {lead.address}
                    </code>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={() => copyAddress(lead.address, lead.id)}
                      title="Copy Address"
                      style={{ padding: '0.15rem 0.45rem', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      {copiedId === lead.id ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                      {copiedId === lead.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              {/* LEAD PRIORITY & SCHEDULING SCORES */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 999,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: lead.followUpUrgency === 'overdue' ? 'rgba(239, 68, 68, 0.2)' : lead.priority === 'High' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(59, 130, 246, 0.15)',
                    color: lead.followUpUrgency === 'overdue' ? '#f87171' : lead.priority === 'High' ? '#fb923c' : 'var(--primary-accent)',
                    border: `1px solid ${lead.followUpUrgency === 'overdue' ? '#f87171' : lead.priority === 'High' ? '#fb923c' : 'var(--primary-accent)'}`
                  }}>
                    {lead.followUpUrgency === 'overdue' ? 'Follow-Up Overdue' : `${lead.priority} Priority`}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.35rem' }}>
                  Lead Priority: <strong style={{ color: 'var(--text-primary)' }}>{lead.rankScore}/100</strong> · Schedule Score: <strong style={{ color: 'var(--text-primary)' }}>{lead.schedulingScore}/100</strong>
                </div>
              </div>
            </div>

            {/* DETAILED FINANCIAL & RECOVERABILITY METRICS GRID */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <Metric
                icon={<ArrowDownLeft size={14} color="var(--primary-accent)" />}
                label="Tainted Value Reaching Lead"
                value={formatLeadAmount(lead.attributedSats, lead.currency)}
                detail="Attributed to suspect source"
              />
              <Metric
                icon={<ArrowUpRight size={14} color="#38bdf8" />}
                label="Gross Volume Moved"
                value={formatLeadAmount(lead.movedSats, lead.currency)}
                detail="Total flow received by address"
              />
              <Metric
                icon={<CheckCircle2 size={14} color="#34d399" />}
                label="Confirmed Unspent Balance"
                value={lead.availableSats ? formatLeadAmount(lead.availableSats, lead.currency) : 'Not established'}
                detail={lead.recoverability === 'unspent_confirmed' ? 'Verified unspent in live UTXO set' : 'Output already spent downstream'}
              />
              <Metric
                icon={<Clock size={14} color="#fbbf24" />}
                label="Last Observed Transaction"
                value={lead.lastObserved}
                detail={lead.lastObservedAgeDays == null ? 'Timestamp unavailable' : `${Math.floor(lead.lastObservedAgeDays)} days ago (${lead.freshness})`}
              />
              <Metric
                icon={<Scale size={14} color="#a855f7" />}
                label="Next Follow-Up"
                value={lead.followUpDueAt ? new Date(lead.followUpDueAt).toLocaleDateString() : 'Not scheduled'}
                detail={lead.followUpUrgency}
              />
              <Metric
                icon={<ShieldCheck size={14} color="#2dd4bf" />}
                label="Verified Contact Desk"
                value={lead.verifiedContact ? lead.verifiedContact.source : 'Not established'}
                detail={lead.verifiedContact?.verifiedAt ? `Verified ${new Date(lead.verifiedContact.verifiedAt).toLocaleDateString()} (${lead.contactFreshness})` : 'No compliance contact on file'}
              />
            </div>

            {/* SCORING FACTORS PROGRESS BREAKDOWN */}
            <div style={{ background: 'var(--bg-inset)', padding: '0.85rem 1rem', borderRadius: 8, display: 'grid', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Multi-Factor Score Composition</span>
                <span style={{ color: 'var(--text-muted)' }}>Deterministic Lead Priority: {lead.rankScore}/100</span>
              </div>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', gap: 2 }}>
                <div style={{ width: `${lead.scoreFactors.value * 35}%`, background: 'var(--primary-accent)' }} title={`Value Factor: ${Math.round(lead.scoreFactors.value * 100)}% (35% wt)`} />
                <div style={{ width: `${lead.scoreFactors.recency * 20}%`, background: '#38bdf8' }} title={`Recency Factor: ${Math.round(lead.scoreFactors.recency * 100)}% (20% wt)`} />
                <div style={{ width: `${lead.scoreFactors.evidence * 45}%`, background: '#34d399' }} title={`Evidence & Contact Factor: ${Math.round(lead.scoreFactors.evidence * 100)}% (45% wt)`} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                <span style={chip}>Value: {Math.round(lead.scoreFactors.value * 100)}%</span>
                <span style={chip}>Recency: {Math.round(lead.scoreFactors.recency * 100)}%</span>
                <span style={chip}>On-Chain Anchor: {Math.round(lead.scoreFactors.evidenceBreakdown.onChain * 100)}%</span>
                <span style={chip}>Attribution Evidence: {Math.round(lead.scoreFactors.evidenceBreakdown.attribution * 100)}%</span>
                {lead.lastTransactionId && (
                  <span style={chip}>Last TxID: {lead.lastTransactionId.slice(0, 16)}…</span>
                )}
              </div>
            </div>

            {/* DEDUPLICATION AMBIGUITY WARNING IF APPLICABLE */}
            {lead.deduplicationAmbiguous && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 6, padding: '0.5rem 0.75rem', color: '#fbbf24', fontSize: '0.73rem' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>Some flow records lack unambiguous transaction IDs. Attributed volume may include duplicate records.</span>
              </div>
            )}

            {/* FOLLOW-UP ACTIONS MANAGEMENT */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'grid', gap: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <FileText size={15} color="var(--primary-accent)" />
                  Statutory &amp; Legal Follow-Up Actions
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.78rem' }}>({lead.actions.length})</span>
                </h4>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  Recovery Outcome: <strong>{lead.evidence.confirmedRecovery.status === 'not_confirmed' ? 'Not Confirmed' : 'Confirmed in Case Record'}</strong>
                </div>
              </div>

              {/* ACTION DRAFT FORM */}
              <div className="recovery-action-form" style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 2fr minmax(160px, 0.8fr) auto', gap: '0.65rem' }}>
                <select
                  className="select-field"
                  aria-label={`Action type for ${lead.label}`}
                  value={drafts[lead.id]?.type || ACTION_TYPES[0]}
                  onChange={e => setDrafts(prev => ({ ...prev, [lead.id]: { ...prev[lead.id], type: e.target.value } }))}
                >
                  {ACTION_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <input
                  className="input-field"
                  aria-label={`Action evidence for ${lead.label}`}
                  placeholder="Supporting evidence reference (e.g. Subpoena Ref #, Freeze Notice ID)"
                  value={drafts[lead.id]?.evidence || ''}
                  onChange={e => setDrafts(prev => ({ ...prev, [lead.id]: { ...prev[lead.id], evidence: e.target.value } }))}
                />
                <input
                  className="input-field"
                  aria-label={`Follow-up due date for ${lead.label}`}
                  type="date"
                  value={drafts[lead.id]?.nextFollowUpAt || ''}
                  onChange={e => setDrafts(prev => ({ ...prev, [lead.id]: { ...prev[lead.id], nextFollowUpAt: e.target.value } }))}
                />
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => addAction(lead)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                >
                  <Plus size={14} /> Add Action
                </button>
              </div>

              {/* EXISTING ACTIONS LIST */}
              {lead.actions.map(action => (
                <div
                  className="recovery-action glass-panel"
                  key={action.id}
                  style={{
                    padding: '0.85rem 1rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '0.75rem',
                    alignItems: 'center',
                    background: 'var(--bg-card)'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{action.type}</strong>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: 2 }}>
                      Added {new Date(action.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  {/* STATUS TRANSITIONS */}
                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Status</label>
                    <select
                      className="select-field"
                      aria-label={`Status for ${action.type}`}
                      value={action.state || RECOVERY_ACTION_STATES.PLANNED}
                      onChange={e => updateRecoveryAction(lead.id, action.id, { state: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      {[action.state || RECOVERY_ACTION_STATES.PLANNED, ...getRecoveryActionTransitions(action)].map(st => (
                        <option key={st} value={st}>{st.replaceAll('_', ' ')}</option>
                      ))}
                    </select>
                  </div>

                  {/* SUPPORTING EVIDENCE */}
                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Evidence / Ref</label>
                    <input
                      className="input-field"
                      aria-label={`Supporting evidence for ${action.type}`}
                      placeholder="Supporting evidence reference"
                      value={action.evidence || ''}
                      onChange={e => updateRecoveryAction(lead.id, action.id, { evidence: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>

                  {/* DEADLINE */}
                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Next Due Date</label>
                    <input
                      className="input-field"
                      aria-label={`Follow-up due date for ${action.type}`}
                      type="date"
                      value={dateInputValue(action.nextFollowUpAt)}
                      onChange={e => updateRecoveryAction(lead.id, action.id, {
                        nextFollowUpAt: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null
                      })}
                      style={{ width: '100%' }}
                    />
                  </div>

                  {/* MANDATORY OUTCOME EVIDENCE FIELD WHEN RECOVERY CONFIRMED IS ALLOWED */}
                  {getRecoveryActionTransitions(action).includes(RECOVERY_ACTION_STATES.RECOVERY_CONFIRMED) && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <input
                        className="input-field"
                        aria-label={`Recovery outcome evidence for ${action.type}`}
                        placeholder="Mandatory outcome evidence reference to confirm recovery (e.g. Deposit Seizure Receipt #)"
                        value={action.outcomeEvidence || ''}
                        onChange={e => updateRecoveryAction(lead.id, action.id, { outcomeEvidence: e.target.value })}
                        style={{ width: '100%', borderColor: !action.outcomeEvidence ? 'var(--risk-medium)' : 'var(--border-color)' }}
                      />
                    </div>
                  )}

                  {/* AUDIT HISTORY TRAIL */}
                  {action.history?.length > 0 && (
                    <div style={{ gridColumn: '1 / -1', color: 'var(--text-muted)', fontSize: '0.71rem', background: 'var(--bg-inset)', padding: '0.45rem 0.65rem', borderRadius: 6 }}>
                      <strong style={{ color: 'var(--text-secondary)' }}>Audit Trail: </strong>
                      {action.history.map((entry, hIndex) => (
                        <span key={hIndex}>
                          {hIndex > 0 ? ' · ' : ''}
                          {entry.event === 'details_updated'
                            ? `Details edited (${entry.changes.join(', ')}) on ${new Date(entry.timestamp).toLocaleDateString()}`
                            : `${entry.from.replaceAll('_', ' ')} → ${entry.to.replaceAll('_', ' ')} (${new Date(entry.timestamp).toLocaleDateString()})`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* INVESTIGATOR REVIEW FOOTER */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.65rem', borderTop: '1px solid var(--border-soft)', paddingTop: '0.75rem', alignItems: 'center' }}>
                <input
                  className="input-field"
                  aria-label={`Lead review note for ${lead.label}`}
                  placeholder="Record an investigator note for this recovery lead..."
                  value={reviewNotes[lead.id] ?? ''}
                  onChange={e => setReviewNotes(prev => ({ ...prev, [lead.id]: e.target.value }))}
                />
                <button
                  className="btn btn-quiet"
                  type="button"
                  onClick={() => markReviewed(lead)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <CheckCircle2 size={14} /> Mark Lead Reviewed
                </button>
                <div style={{ gridColumn: '1 / -1', color: 'var(--text-muted)', fontSize: '0.71rem' }}>
                  Last Review Status: <strong>{lead.lastReviewedAt ? new Date(lead.lastReviewedAt).toLocaleString() : 'Not reviewed'}</strong> ({lead.reviewFreshness})
                  {lead.reviewNote ? ` · Note: "${lead.reviewNote}"` : ''}
                </div>
              </div>
            </div>

          </article>
        ))
      )}
    </section>
  );
}

function KpiCard({ icon, title, value, subtitle, alert }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${alert ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-color)'}`,
      borderRadius: 'var(--radius-md)',
      padding: '0.9rem 1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.25rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
        {icon}
        <span>{title}</span>
      </div>
      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: alert ? '#f87171' : 'var(--text-primary)', letterSpacing: '-0.02em', marginTop: 2 }}>
        {value}
      </div>
      <div style={{ fontSize: '0.68rem', color: alert ? '#f87171' : 'var(--text-muted)' }}>
        {subtitle}
      </div>
    </div>
  );
}

function Metric({ icon, label, value, detail }) {
  return (
    <div style={{ padding: '0.75rem', background: 'var(--bg-inset)', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.02)' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.69rem', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
        {icon}
        {label}
      </div>
      <strong style={{ display: 'block', marginTop: 5, fontSize: '0.85rem', overflowWrap: 'anywhere', color: 'var(--text-primary)' }}>
        {value}
      </strong>
      {detail && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.67rem', marginTop: 3 }}>
          {detail}
        </div>
      )}
    </div>
  );
}

const chip = {
  border: '1px solid var(--border-color)',
  borderRadius: 999,
  padding: '0.2rem 0.5rem',
  background: 'rgba(255, 255, 255, 0.025)'
};
