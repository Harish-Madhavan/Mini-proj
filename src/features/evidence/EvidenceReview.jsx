import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  GitCompareArrows,
  Plus,
  ShieldCheck,
  ShieldAlert,
  Search,
  Check,
  Copy,
  Clock,
  ArrowRight,
  Filter,
  FileText,
  Upload,
  Download,
  AlertCircle,
  HelpCircle,
  TrendingDown,
  Layers
} from 'lucide-react';
import { useCase } from '../../hooks/useCase';
import { useToast } from '../../hooks/useToast';
import {
  buildAlternativePaths,
  buildEvidenceGapChecklist,
  deriveEvidenceClaims
} from './evidenceReview';
import { compareTraceSnapshots, createTraceSnapshot, verifyTraceSnapshot } from '../../utils/traceSnapshot';
import { downloadJson } from '../../utils/download';

const MAX_SNAPSHOT_FILE_BYTES = 5 * 1024 * 1024;

export default function EvidenceReview() {
  const {
    activeCase,
    addEvidenceClaim,
    updateEvidenceClaimReview,
    updatePathReview
  } = useCase();
  const { showToast } = useToast();

  // Active section view tab
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'CLAIMS' | 'PATHS' | 'GAPS' | 'SNAPSHOTS'

  // Draft claim state
  const [draft, setDraft] = useState({
    classification: 'Attribution hypothesis',
    statement: '',
    sourceReference: ''
  });

  // Path assessment edits
  const [pathDrafts, setPathDrafts] = useState({});
  const [claimNotes, setClaimNotes] = useState({});

  // Snapshot integrity & comparison state
  const [snapshotFiles, setSnapshotFiles] = useState({ earlier: null, later: null });
  const [snapshotError, setSnapshotError] = useState('');
  const [isExportingSnapshot, setIsExportingSnapshot] = useState(false);

  // Search & Filters for Claims
  const [claimsSearch, setClaimsSearch] = useState('');
  const [claimsStatusFilter, setClaimsStatusFilter] = useState('ALL');
  const [claimsClassFilter, setClaimsClassFilter] = useState('ALL');

  // Copied indicator state
  const [copiedTxid, setCopiedTxid] = useState(null);

  // Derived analysis
  const claims = useMemo(() => deriveEvidenceClaims(activeCase), [activeCase]);
  const paths = useMemo(() => buildAlternativePaths(activeCase), [activeCase]);
  const gaps = useMemo(() => buildEvidenceGapChecklist(activeCase), [activeCase]);

  // Snapshot comparison
  const snapshotComparison = useMemo(() => {
    const earlier = snapshotFiles.earlier;
    const later = snapshotFiles.later;
    if (!earlier?.verification?.valid || !later?.verification?.valid) return null;
    try {
      return compareTraceSnapshots(earlier.snapshot, later.snapshot);
    } catch (error) {
      return { error: error.message };
    }
  }, [snapshotFiles]);

  // High-level summary metrics
  const kpis = useMemo(() => {
    const totalClaims = claims.length;
    const reviewedCount = claims.filter(c => c.review.status !== 'unreviewed').length;
    const highGaps = gaps.filter(g => g.priority === 'high').length;
    const unreviewedPaths = paths.filter(p => p.review.status === 'unreviewed').length;

    return {
      totalClaims,
      reviewedCount,
      reviewedPercent: totalClaims ? Math.round((reviewedCount / totalClaims) * 100) : 0,
      totalPaths: paths.length,
      unreviewedPaths,
      totalGaps: gaps.length,
      highGaps
    };
  }, [claims, paths, gaps]);

  // Filtered claims
  const filteredClaims = useMemo(() => {
    return claims.filter(claim => {
      const query = claimsSearch.toLowerCase().trim();
      const matchesSearch = !query ||
        claim.statement.toLowerCase().includes(query) ||
        claim.classification.toLowerCase().includes(query) ||
        claim.sourceReference.toLowerCase().includes(query);

      const matchesStatus =
        claimsStatusFilter === 'ALL' ||
        (claimsStatusFilter === 'UNREVIEWED' && claim.review.status === 'unreviewed') ||
        (claimsStatusFilter === 'REVIEWED' && claim.review.status === 'reviewed') ||
        (claimsStatusFilter === 'CONFIRMED' && claim.review.status === 'independently_confirmed') ||
        (claimsStatusFilter === 'DISPUTED' && claim.review.status === 'disputed');

      const matchesClass =
        claimsClassFilter === 'ALL' ||
        claim.evidenceClass === claimsClassFilter;

      return matchesSearch && matchesStatus && matchesClass;
    });
  }, [claims, claimsSearch, claimsStatusFilter, claimsClassFilter]);

  function copyText(text, id) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedTxid(id);
      setTimeout(() => setCopiedTxid(null), 2000);
    }
  }

  const handleExportActiveSnapshot = async () => {
    if (!activeCase?.id || !activeCase?.nodes?.length) {
      showToast?.('No active trace to export into a snapshot.', 'warning');
      return;
    }
    setIsExportingSnapshot(true);
    try {
      const snapshot = await createTraceSnapshot(activeCase);
      const safeCaseId = (activeCase.id || 'case').replace(/[^a-zA-Z0-9_-]/g, '-');
      const snapshotDate = snapshot.capturedAt.slice(0, 10);
      downloadJson(snapshot, `aegistrace-trace-snapshot-${safeCaseId}-${snapshotDate}.json`);
      showToast?.('Trace snapshot downloaded. Digest verifies payload integrity.', 'info', 5000);
    } catch (error) {
      showToast?.(`Could not export trace snapshot: ${error.message}`, 'error', 6000);
    } finally {
      setIsExportingSnapshot(false);
    }
  };

  async function loadSnapshot(slot, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSnapshotError('');
    if (file.size > MAX_SNAPSHOT_FILE_BYTES) {
      setSnapshotError('Snapshot file exceeds the 5 MB limit.');
      return;
    }

    try {
      const snapshot = JSON.parse(await file.text());
      const verification = await verifyTraceSnapshot(snapshot);
      setSnapshotFiles(previous => ({
        ...previous,
        [slot]: { fileName: file.name, snapshot, verification },
      }));
    } catch (error) {
      setSnapshotFiles(previous => ({ ...previous, [slot]: null }));
      setSnapshotError(`Could not read or verify snapshot: ${error.message}`);
    }
  }

  function submitClaim(event) {
    event.preventDefault();
    const statement = draft.statement.trim();
    const sourceReference = draft.sourceReference.trim();
    if (!statement || !sourceReference) return;
    const now = new Date().toISOString();
    addEvidenceClaim({
      id: `claim:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
      origin: 'investigator_entered',
      evidenceClass: draft.classification === 'Attribution hypothesis'
        ? 'attribution_hypothesis'
        : draft.classification === 'Investigator-reported outcome'
          ? 'investigator_reported_outcome'
          : 'external_record',
      classification: draft.classification,
      statement,
      sourceReference,
      sourceStrength: 'Investigator-entered reference; source contents are not verified by AegisTrace',
      status: 'recorded',
      createdAt: now,
      attributionWarning: 'This entry records an investigator statement and is not independently verified by the application.'
    });
    setDraft({ classification: 'Attribution hypothesis', statement: '', sourceReference: '' });
  }

  function savePathReview(path) {
    const edit = pathDrafts[path.signature] || path.review;
    const rationale = String(edit.rationale || '').trim();
    if (edit.status !== 'unreviewed' && !rationale) return;
    updatePathReview(path.signature, { status: edit.status, rationale, reviewedAt: new Date().toISOString() });
  }

  if (!activeCase) {
    return (
      <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Select or trace a case first to begin evidence review.
      </div>
    );
  }

  return (
    <section className="workflow-page evidence-page" style={{ display: 'grid', gap: '1.25rem', paddingTop: '1.25rem' }}>
      
      {/* HEADER & EXECUTIVE SUMMARY */}
      <header className="workflow-header glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(59, 130, 246, 0.15)', display: 'grid', placeItems: 'center', color: 'var(--primary-accent)' }}>
              <ClipboardCheck size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
                Evidence Review &amp; Quality Audit
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0.2rem 0 0 0' }}>
                Case: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{activeCase.title || activeCase.name || activeCase.id}</span> · Auditing claims, route alternatives, and coverage gaps
              </p>
            </div>
          </div>
          <div className="workflow-summary">
            <span><strong>{claims.length}</strong> evidence claims</span>
            <span><strong>{paths.length}</strong> candidate routes</span>
            <span><strong>{gaps.length}</strong> open gap prompts</span>
          </div>
        </div>

        {/* TOP LEVEL KPI CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginTop: '0.4rem' }}>
          <KpiCard
            icon={<ClipboardCheck size={16} color="var(--primary-accent)" />}
            title="Claim Review Cadence"
            value={`${kpis.reviewedCount} / ${kpis.totalClaims}`}
            subtitle={`${kpis.reviewedPercent}% claims adjudicated`}
          />
          <KpiCard
            icon={<GitCompareArrows size={16} color="#38bdf8" />}
            title="Competing Routes"
            value={`${kpis.totalPaths} Routes`}
            subtitle={kpis.unreviewedPaths ? `${kpis.unreviewedPaths} unreviewed candidates` : 'All routes dispositioned'}
            alert={kpis.unreviewedPaths > 0}
          />
          <KpiCard
            icon={<AlertTriangle size={16} color={kpis.highGaps ? '#f87171' : '#fbbf24'} />}
            title="Evidence Gaps"
            value={`${kpis.totalGaps} Prompts`}
            subtitle={kpis.highGaps ? `${kpis.highGaps} critical coverage gaps` : 'No high-severity gaps'}
            alert={kpis.highGaps > 0}
          />
          <KpiCard
            icon={<FileCheck2 size={16} color="#34d399" />}
            title="Snapshot State"
            value={snapshotFiles.later?.verification?.valid ? 'Digest Verified' : snapshotFiles.later ? 'Verification Failed' : 'Ready to Verify'}
            subtitle={snapshotFiles.later ? snapshotFiles.later.fileName : 'Export & compare JSON captures'}
          />
        </div>
      </header>

      {/* STATUTORY & EVIDENTIARY SAFEGUARD BANNER */}
      <aside className="workflow-notice glass-panel" style={{ padding: '0.85rem 1.15rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <ShieldCheck size={18} style={{ color: 'var(--primary-accent)', flexShrink: 0 }} />
        <span>
          <strong>Evidentiary Governance:</strong> On-chain transaction records, attribution hypotheses, external citations, and investigator outcomes are maintained in distinct classes. Review statuses record investigator determinations; they do not imply automated authentication of third-party identities under Section 65B BSA.
        </span>
      </aside>

      {/* SECTION NAV TABS */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        {[
          { id: 'ALL', label: 'All Modules' },
          { id: 'CLAIMS', label: `Claims Ledger (${claims.length})` },
          { id: 'PATHS', label: `Route Alternatives (${paths.length})` },
          { id: 'Gaps', label: `Coverage Gaps (${gaps.length})` },
          { id: 'SNAPSHOTS', label: 'Snapshot Diff & Verification' }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : 'btn-quiet'}`}
            onClick={() => setActiveTab(tab.id)}
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ============================================================== */}
      {/* 1. SNAPSHOT VERIFICATION & COMPARISON MODULE */}
      {/* ============================================================== */}
      {(activeTab === 'ALL' || activeTab === 'SNAPSHOTS') && (
        <section className="workflow-section glass-panel" style={{ display: 'grid', gap: '1rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <SectionHeader
              icon={<FileCheck2 size={18} />}
              title="Trace Snapshot Verification &amp; Tamper Audit"
              subtitle="Verify standalone JSON trace integrity via SHA-256 digests and compare two captures of the same case"
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleExportActiveSnapshot}
              disabled={isExportingSnapshot}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem' }}
              title="Export the active case and its graph as an integrity-sealed SHA-256 JSON snapshot"
            >
              <Download size={13} />
              {isExportingSnapshot ? 'Generating Snapshot…' : 'Export Active Case Snapshot (.json)'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
            {[
              ['earlier', 'Earlier Case Snapshot (Baseline)'],
              ['later', 'Later Case Snapshot (Comparison)'],
            ].map(([slot, label]) => {
              const entry = snapshotFiles[slot];
              return (
                <div key={slot} style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '1rem', display: 'grid', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }} htmlFor={`snapshot-${slot}`}>
                      {label}
                    </label>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Max 5 MB JSON</span>
                  </div>
                  <input
                    id={`snapshot-${slot}`}
                    type="file"
                    accept=".json,application/json"
                    onChange={event => loadSnapshot(slot, event)}
                    aria-label={`Upload ${label.toLowerCase()} JSON`}
                    style={{ fontSize: '0.75rem' }}
                  />
                  {entry && (
                    <div style={{ marginTop: '0.3rem', display: 'grid', gap: '0.3rem' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                        <strong>File:</strong> {entry.fileName} · Case {entry.snapshot.caseData?.id || 'unknown'} · {entry.snapshot.capturedAt ? new Date(entry.snapshot.capturedAt).toLocaleString() : 'time unavailable'}
                      </div>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: 6,
                        background: entry.verification.valid ? 'rgba(52, 211, 153, 0.12)' : 'rgba(239, 68, 68, 0.15)',
                        color: entry.verification.valid ? '#34d399' : '#f87171',
                        border: `1px solid ${entry.verification.valid ? 'rgba(52, 211, 153, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                      }}>
                        {entry.verification.valid ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                        {entry.verification.valid ? 'Digest Matches Payload (Integrity Intact)' : `Integrity Compromised: ${entry.verification.reason}`}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {snapshotError && (
            <p role="alert" style={{ color: '#f87171', fontSize: '0.78rem', margin: 0, padding: '0.5rem 0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 6 }}>
              {snapshotError}
            </p>
          )}

          {/* DEEP SNAPSHOT COMPARISON DIFF */}
          {snapshotComparison && !snapshotComparison.error && (
            <div style={{ padding: '1rem', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 10, display: 'grid', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                  Stored Graph Comparison · Case {snapshotComparison.caseId}
                </strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  {snapshotComparison.earlierCapturedAt} <ArrowRight size={12} style={{ verticalAlign: 'middle', margin: '0 3px' }} /> {snapshotComparison.laterCapturedAt}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
                <MetricMini
                  label="Nodes Graph Diff"
                  value={`${snapshotComparison.nodes.earlier} → ${snapshotComparison.nodes.later}`}
                  detail={`+${snapshotComparison.nodes.added.length} added, -${snapshotComparison.nodes.removed.length} removed, ${snapshotComparison.nodes.changed.length} changed`}
                />
                <MetricMini
                  label="Links Flow Diff"
                  value={`${snapshotComparison.links.earlier} → ${snapshotComparison.links.later}`}
                  detail={`+${snapshotComparison.links.added.length} added, -${snapshotComparison.links.removed.length} removed, ${snapshotComparison.links.changed.length} changed`}
                />
                <MetricMini
                  label="Transaction References"
                  value={`${snapshotComparison.transactionReferences.earlier} → ${snapshotComparison.transactionReferences.later}`}
                  detail={`+${snapshotComparison.transactionReferences.added.length} added, -${snapshotComparison.transactionReferences.removed.length} removed`}
                />
                <MetricMini
                  label="Trace Warnings"
                  value={`${snapshotComparison.warnings.added.length} added, ${snapshotComparison.warnings.cleared.length} cleared`}
                  detail={`${snapshotComparison.warnings.unchanged.length} persistent`}
                />
              </div>

              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '0.65rem 0.85rem', borderRadius: 6, lineHeight: 1.5 }}>
                <strong>Trace Coverage Progression:</strong> Pruned branches: {snapshotComparison.coverage.earlier.prunedBranches} → {snapshotComparison.coverage.later.prunedBranches} · Omitted nodes/links: {snapshotComparison.coverage.earlier.omittedNodes}/{snapshotComparison.coverage.earlier.omittedLinks} → {snapshotComparison.coverage.later.omittedNodes}/{snapshotComparison.coverage.later.omittedLinks} · Address history scan complete: {String(snapshotComparison.coverage.earlier.addressHistoryComplete)} → {String(snapshotComparison.coverage.later.addressHistoryComplete)}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ============================================================== */}
      {/* 2. EVIDENCE CLAIM LEDGER */}
      {/* ============================================================== */}
      {(activeTab === 'ALL' || activeTab === 'CLAIMS') && (
        <section className="workflow-section glass-panel" style={{ display: 'grid', gap: '1rem', padding: '1.25rem' }}>
          <SectionHeader
            icon={<ClipboardCheck size={18} />}
            title="Evidence Claim Ledger"
            subtitle={`${kpis.reviewedCount} of ${claims.length} claims reviewed (${kpis.reviewedPercent}%)`}
          />

          {/* CLAIMS SEARCH & FILTERS BAR */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-inset)', padding: '0.75rem', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 240px', position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.65rem', color: 'var(--text-muted)' }} />
              <input
                className="input-field"
                type="text"
                placeholder="Search claims by statement, source, or reference..."
                value={claimsSearch}
                onChange={e => setClaimsSearch(e.target.value)}
                style={{ paddingLeft: '1.9rem', width: '100%', fontSize: '0.75rem' }}
                aria-label="Filter claims by search query"
              />
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Review:</span>
              {['ALL', 'UNREVIEWED', 'REVIEWED', 'CONFIRMED', 'DISPUTED'].map(status => (
                <button
                  key={status}
                  type="button"
                  className={`btn btn-sm ${claimsStatusFilter === status ? 'btn-primary' : 'btn-quiet'}`}
                  style={{ fontSize: '0.69rem', padding: '0.15rem 0.45rem' }}
                  onClick={() => setClaimsStatusFilter(status)}
                >
                  {status}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <select
                className="select-field"
                value={claimsClassFilter}
                onChange={e => setClaimsClassFilter(e.target.value)}
                style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                aria-label="Filter claims by evidence class"
              >
                <option value="ALL">All Classes</option>
                <option value="on_chain_reference">On-Chain Reference</option>
                <option value="attribution_hypothesis">Attribution Hypothesis</option>
                <option value="external_record">External Record</option>
                <option value="investigator_reported_outcome">Investigator Outcome</option>
              </select>
            </div>
          </div>

          {/* ADD INVESTIGATOR CLAIM FORM */}
          <form onSubmit={submitClaim} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 2fr 1.5fr auto', gap: '0.6rem', background: 'var(--bg-card)', padding: '0.85rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <select
              className="select-field"
              value={draft.classification}
              onChange={event => setDraft({ ...draft, classification: event.target.value })}
              aria-label="Claim classification"
            >
              <option>Attribution hypothesis</option>
              <option>External evidence reference</option>
              <option>Investigator-reported outcome</option>
            </select>
            <input
              className="input-field"
              placeholder="Finding or statement to record for the case dossier"
              value={draft.statement}
              onChange={event => setDraft({ ...draft, statement: event.target.value })}
              required
              aria-label="Claim statement"
            />
            <input
              className="input-field"
              placeholder="Source provenance (e.g. Subpoena Response, FIU Notice)"
              value={draft.sourceReference}
              onChange={event => setDraft({ ...draft, sourceReference: event.target.value })}
              required
              aria-label="Claim source reference"
            />
            <button className="btn btn-primary" type="submit" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <Plus size={14} /> Add Claim
            </button>
          </form>

          {/* CLAIMS CARDS */}
          {!filteredClaims.length ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              No claims match your filter criteria.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {filteredClaims.map(claim => {
                const status = claim.review.status;
                const isConfirmed = status === 'independently_confirmed';
                const isDisputed = status === 'disputed';
                const isReviewed = status === 'reviewed';

                return (
                  <article className="glass-panel" key={claim.id} style={{ padding: '0.95rem 1.15rem', display: 'grid', gap: '0.65rem', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 4,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            background: claim.evidenceClass === 'on_chain_reference' ? 'rgba(59, 130, 246, 0.15)' : claim.evidenceClass === 'external_record' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                            color: claim.evidenceClass === 'on_chain_reference' ? 'var(--primary-accent)' : claim.evidenceClass === 'external_record' ? '#34d399' : '#c084fc',
                            border: '1px solid currentColor'
                          }}>
                            {claim.classification}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Origin: {claim.origin === 'investigator_entered' ? 'Investigator Record' : 'Trace Derived'}
                          </span>
                        </div>
                        <p style={{ marginTop: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                          {claim.statement}
                        </p>
                      </div>

                      {/* REVIEW BADGE */}
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '0.2rem 0.6rem',
                        borderRadius: 999,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        background: isConfirmed ? 'rgba(52, 211, 153, 0.15)' : isDisputed ? 'rgba(239, 68, 68, 0.15)' : isReviewed ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        color: isConfirmed ? '#34d399' : isDisputed ? '#f87171' : isReviewed ? 'var(--primary-accent)' : 'var(--text-muted)',
                        border: `1px solid ${isConfirmed ? 'rgba(52, 211, 153, 0.3)' : isDisputed ? 'rgba(239, 68, 68, 0.3)' : isReviewed ? 'rgba(59, 130, 246, 0.3)' : 'var(--border-color)'}`
                      }}>
                        {isConfirmed && <CheckCircle2 size={12} />}
                        {isDisputed && <AlertTriangle size={12} />}
                        {isReviewed && <Check size={12} />}
                        {!isConfirmed && !isDisputed && !isReviewed && <Clock size={12} />}
                        {status.replaceAll('_', ' ')}
                      </span>
                    </div>

                    {/* SOURCE PROVENANCE */}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-inset)', padding: '0.5rem 0.75rem', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <strong>Source Citation:</strong> {claim.sourceReference} · <span style={{ color: 'var(--text-muted)' }}>{claim.sourceStrength}</span>
                      </div>
                      {claim.transactionId && (
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm"
                          style={{ padding: '0.1rem 0.4rem', fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                          onClick={() => copyText(claim.transactionId, claim.id)}
                        >
                          {copiedTxid === claim.id ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                          {copiedTxid === claim.id ? 'Copied TxID' : 'Copy TxID'}
                        </button>
                      )}
                    </div>

                    {claim.attributionWarning && (
                      <p style={{ fontSize: '0.72rem', color: '#fbbf24', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <AlertCircle size={13} style={{ flexShrink: 0 }} />
                        {claim.attributionWarning}
                      </p>
                    )}

                    {/* REVIEW FORM */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 1fr) 2fr auto', gap: '0.55rem', borderTop: '1px solid var(--border-soft)', paddingTop: '0.65rem', alignItems: 'center' }}>
                      <select
                        className="select-field"
                        value={claim.review.status}
                        onChange={event => {
                          const currentNote = claimNotes[claim.id] !== undefined ? claimNotes[claim.id] : (claim.review.reviewerNote || '');
                          if (event.target.value !== 'unreviewed' && !String(currentNote).trim()) return;
                          updateEvidenceClaimReview(claim.id, {
                            ...claim.review,
                            reviewerNote: currentNote,
                            status: event.target.value,
                            reviewedAt: new Date().toISOString()
                          });
                        }}
                        aria-label={`Review state for ${claim.classification}`}
                      >
                        <option value="unreviewed">Unreviewed</option>
                        <option value="reviewed">Reviewed by investigator</option>
                        <option value="disputed">Disputed</option>
                        <option value="independently_confirmed">Marked independently confirmed</option>
                      </select>

                      <input
                        className="input-field"
                        placeholder="Reviewer note / independent verification reference (required to change status)"
                        value={claimNotes[claim.id] !== undefined ? claimNotes[claim.id] : (claim.review.reviewerNote || '')}
                        onChange={event => {
                          const val = event.target.value;
                          setClaimNotes(prev => ({ ...prev, [claim.id]: val }));
                          updateEvidenceClaimReview(claim.id, { ...claim.review, reviewerNote: val });
                        }}
                        aria-label={`Reviewer note for ${claim.classification}`}
                      />

                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {claim.review.reviewedAt ? new Date(claim.review.reviewedAt).toLocaleDateString() : 'Not reviewed'}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ============================================================== */}
      {/* 3. ALTERNATIVE PATH COMPARISON */}
      {/* ============================================================== */}
      {(activeTab === 'ALL' || activeTab === 'PATHS') && (
        <section className="workflow-section glass-panel" style={{ display: 'grid', gap: '1rem', padding: '1.25rem' }}>
          <SectionHeader
            icon={<GitCompareArrows size={18} />}
            title="Alternative Path Comparison"
            subtitle="Candidate simple fund-flow routes (capped at 30 paths and 10 hops) with bottleneck and transaction coverage metrics"
          />

          {!paths.length ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              No bounded source-to-terminal routes detected in this case graph.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              {paths.map(path => {
                const edit = pathDrafts[path.signature] || path.review;
                return (
                  <article className="glass-panel" key={path.id} style={{ padding: '1rem', display: 'grid', gap: '0.65rem', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(59, 130, 246, 0.15)', color: 'var(--primary-accent)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '0.82rem' }}>
                          #{path.rank}
                        </span>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          Candidate Route ({path.hopCount} Transfers)
                        </strong>
                      </div>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.15rem 0.55rem',
                        borderRadius: 999,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        background: edit.status === 'selected_for_review' ? 'rgba(52, 211, 153, 0.15)' : edit.status === 'rejected' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        color: edit.status === 'selected_for_review' ? '#34d399' : edit.status === 'rejected' ? '#f87171' : 'var(--text-muted)',
                        border: '1px solid currentColor'
                      }}>
                        {edit.status.replaceAll('_', ' ')}
                      </span>
                    </div>

                    {/* PATH TRAJECTORY BREADCRUMBS */}
                    <div style={{ background: 'var(--bg-inset)', padding: '0.6rem 0.8rem', borderRadius: 8, fontSize: '0.76rem', color: 'var(--text-primary)', overflowWrap: 'anywhere', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {path.addressPath.map((addr, aIdx) => (
                        <React.Fragment key={aIdx}>
                          <code className="mono-addr" style={{ color: aIdx === 0 ? '#f87171' : aIdx === path.addressPath.length - 1 ? '#34d399' : 'var(--primary-accent)' }}>
                            {addr.length > 20 ? `${addr.slice(0, 10)}…${addr.slice(-8)}` : addr}
                          </code>
                          {aIdx < path.addressPath.length - 1 && <ArrowRight size={12} color="var(--text-muted)" />}
                        </React.Fragment>
                      ))}
                    </div>

                    {/* PATH FINANCIAL & COVERAGE METRICS */}
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.72rem' }}>
                      <span style={chip}>Bottleneck Capacity: <strong>{(path.bottleneckSats / 1e8).toFixed(4)} BTC</strong></span>
                      <span style={chip}>Estimated Taint Flow: <strong>{(path.estimatedTaintedSats / 1e8).toFixed(4)} BTC</strong></span>
                      <span style={chip}>TxID Coverage: <strong>{Math.round(path.directTransactionReferenceCoverage * 100)}%</strong></span>
                      <span style={chip}>{path.evidenceLabel}</span>
                    </div>

                    {/* PATH ASSESSMENT WORKFLOW */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 2fr auto', gap: '0.55rem', borderTop: '1px solid var(--border-soft)', paddingTop: '0.65rem' }}>
                      <select
                        className="select-field"
                        value={edit.status}
                        onChange={event => setPathDrafts(previous => ({ ...previous, [path.signature]: { ...edit, status: event.target.value } }))}
                        aria-label={`Assessment for path ${path.rank}`}
                      >
                        <option value="unreviewed">Unreviewed</option>
                        <option value="selected_for_review">Selected for further review</option>
                        <option value="rejected">Rejected by investigator</option>
                        <option value="needs_corroboration">Needs corroboration</option>
                      </select>
                      <input
                        className="input-field"
                        placeholder="Reason and evidence citation (required to save decision)"
                        value={edit.rationale || ''}
                        onChange={event => setPathDrafts(previous => ({ ...previous, [path.signature]: { ...edit, rationale: event.target.value } }))}
                        aria-label={`Rationale for path ${path.rank}`}
                      />
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        disabled={edit.status !== 'unreviewed' && !String(edit.rationale || '').trim()}
                        onClick={() => savePathReview(path)}
                      >
                        Save Assessment
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ============================================================== */}
      {/* 4. EVIDENCE GAP CHECKLIST */}
      {/* ============================================================== */}
      {(activeTab === 'ALL' || activeTab === 'GAPS') && (
        <section className="workflow-section glass-panel" style={{ display: 'grid', gap: '1rem', padding: '1.25rem' }}>
          <SectionHeader
            icon={<AlertTriangle size={18} />}
            title="Evidence Gap &amp; Corroboration Checklist"
            subtitle="Automatically surfaced investigation prompts to ensure digital evidence integrity before court submission"
          />

          {!gaps.length ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              <CheckCircle2 size={24} color="#34d399" style={{ margin: '0 auto 0.5rem auto' }} />
              No open gap prompts detected for this case. Note that automated completeness does not guarantee factual accuracy.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {gaps.map(gap => (
                <div
                  className="evidence-gap glass-panel"
                  key={gap.id}
                  style={{
                    padding: '0.9rem 1.15rem',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(200px, 1fr) 2fr',
                    gap: '0.5rem 1rem',
                    background: 'var(--bg-card)',
                    borderLeft: `3px solid ${gap.priority === 'high' ? '#f87171' : '#fbbf24'}`
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        padding: '0.1rem 0.4rem',
                        borderRadius: 4,
                        background: gap.priority === 'high' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: gap.priority === 'high' ? '#f87171' : '#fbbf24'
                      }}>
                        {gap.priority}
                      </span>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {gap.title}
                      </strong>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                      {gap.detail}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', background: 'var(--bg-inset)', padding: '0.35rem 0.6rem', borderRadius: 4 }}>
                      <strong style={{ color: 'var(--primary-accent)' }}>Recommended Action: </strong>
                      {gap.recommendation}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
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

function MetricMini({ label, value, detail }) {
  return (
    <div style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-card)', borderRadius: 6, border: '1px solid var(--border-soft)' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{value}</div>
      {detail && <div style={{ color: 'var(--text-muted)', fontSize: '0.67rem', marginTop: 2 }}>{detail}</div>}
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
      <span style={{ color: 'var(--primary-accent)', marginTop: 2 }}>{icon}</span>
      <div>
        <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{title}</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0.2rem 0 0 0' }}>{subtitle}</p>
      </div>
    </div>
  );
}

const chip = {
  border: '1px solid var(--border-color)',
  borderRadius: 999,
  padding: '0.2rem 0.55rem',
  background: 'rgba(255, 255, 255, 0.025)',
  color: 'var(--text-secondary)'
};
