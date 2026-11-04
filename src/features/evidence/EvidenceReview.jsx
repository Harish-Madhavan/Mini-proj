import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileCheck2, GitCompareArrows, Plus, ShieldCheck } from 'lucide-react';
import { useCase } from '../../hooks/useCase';
import { buildAlternativePaths, buildEvidenceGapChecklist, deriveEvidenceClaims } from './evidenceReview';
import { compareTraceSnapshots, verifyTraceSnapshot } from '../../utils/traceSnapshot';

const box = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem' };
const inputStyle = { width: '100%' };
const MAX_SNAPSHOT_FILE_BYTES = 5 * 1024 * 1024;

export default function EvidenceReview() {
  const { activeCase, addEvidenceClaim, updateEvidenceClaimReview, updatePathReview } = useCase();
  const [draft, setDraft] = useState({ classification: 'Attribution hypothesis', statement: '', sourceReference: '' });
  const [pathDrafts, setPathDrafts] = useState({});
  const [snapshotFiles, setSnapshotFiles] = useState({ earlier: null, later: null });
  const [snapshotError, setSnapshotError] = useState('');
  const claims = useMemo(() => deriveEvidenceClaims(activeCase), [activeCase]);
  const paths = useMemo(() => buildAlternativePaths(activeCase), [activeCase]);
  const gaps = useMemo(() => buildEvidenceGapChecklist(activeCase), [activeCase]);
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
  const reviewedClaims = claims.filter(claim => claim.review.status !== 'unreviewed').length;

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
      evidenceClass: draft.classification === 'Attribution hypothesis' ? 'attribution_hypothesis' : draft.classification === 'Investigator-reported outcome' ? 'investigator_reported_outcome' : 'external_record',
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

  if (!activeCase) return <div style={{ color: 'var(--text-secondary)' }}>Select a case first.</div>;

  return <section className="workflow-page evidence-page" style={{ display: 'grid', gap: '1rem', paddingTop: '1.25rem' }}>
    <header className="workflow-header" style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <ClipboardCheck size={21} color="var(--primary-accent)" />
        <div><h2 style={{ fontSize: '1.15rem' }}>Evidence review</h2><p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{activeCase.title} · claims, competing routes, and evidence gaps</p></div>
      </div>
      <div className="workflow-summary"><span><strong>{claims.length}</strong> claims</span><span><strong>{paths.length}</strong> candidate paths</span><span><strong>{gaps.length}</strong> open gaps</span></div>
    </header>

    <aside className="workflow-notice" style={{ ...box, display: 'flex', gap: '0.55rem', alignItems: 'flex-start', color: 'var(--text-secondary)', fontSize: '0.79rem' }}>
      <ShieldCheck size={15} color="var(--primary-accent)" style={{ flexShrink: 0 }} />
      On-chain records, attribution hypotheses, external references, and investigator-reported outcomes are kept distinct. A review status records investigator workflow; it does not mean the application authenticated a source or verified an address owner.
    </aside>

    <section className="workflow-section" style={box}>
      <SectionHeader icon={<FileCheck2 size={16} />} title="Snapshot verification and comparison" subtitle="Verify exported trace integrity, then compare captures of the same case" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem', marginTop: '0.8rem' }}>
        {[
          ['earlier', 'Earlier snapshot'],
          ['later', 'Later snapshot'],
        ].map(([slot, label]) => {
          const entry = snapshotFiles[slot];
          return <div key={slot} style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.75rem', display: 'grid', gap: '0.45rem' }}>
            <label style={{ fontSize: '0.76rem', fontWeight: 600 }} htmlFor={`snapshot-${slot}`}>{label} JSON (max 5 MB)</label>
            <input id={`snapshot-${slot}`} type="file" accept=".json,application/json" onChange={event => loadSnapshot(slot, event)} aria-label={`Upload ${label.toLowerCase()} JSON`} />
            {entry && <>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{entry.fileName} · case {entry.snapshot.caseData?.id || 'unknown'} · {entry.snapshot.capturedAt}</span>
              <strong role="status" style={{ fontSize: '0.72rem', color: entry.verification.valid ? 'var(--color-success, #54dfc2)' : '#f87171' }}>
                {entry.verification.valid ? 'Digest matches the recorded snapshot' : `Not verified — ${entry.verification.reason}`}
              </strong>
            </>}
          </div>;
        })}
      </div>
      {snapshotError && <p role="alert" style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '0.6rem' }}>{snapshotError}</p>}
      {snapshotComparison?.error && <p role="alert" style={{ color: '#fbbf24', fontSize: '0.75rem', marginTop: '0.6rem' }}>{snapshotComparison.error}</p>}
      {snapshotComparison && !snapshotComparison.error && <div style={{ marginTop: '0.75rem', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 8, display: 'grid', gap: '0.35rem' }}>
        <strong style={{ fontSize: '0.78rem' }}>Stored graph comparison · {snapshotComparison.caseId}</strong>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{snapshotComparison.earlierCapturedAt} → {snapshotComparison.laterCapturedAt}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Nodes: {snapshotComparison.nodes.earlier} → {snapshotComparison.nodes.later} ({snapshotComparison.nodes.added.length} added, {snapshotComparison.nodes.removed.length} removed, {snapshotComparison.nodes.changed.length} changed) · Links: {snapshotComparison.links.earlier} → {snapshotComparison.links.later} ({snapshotComparison.links.added.length} added, {snapshotComparison.links.removed.length} removed, {snapshotComparison.links.changed.length} changed)</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Transaction references: {snapshotComparison.transactionReferences.earlier} → {snapshotComparison.transactionReferences.later} ({snapshotComparison.transactionReferences.added.length} added, {snapshotComparison.transactionReferences.removed.length} removed) · Source manifest entries: {snapshotComparison.sourceManifest.earlier} → {snapshotComparison.sourceManifest.later} ({snapshotComparison.sourceManifest.added.length} added, {snapshotComparison.sourceManifest.removed.length} removed, {snapshotComparison.sourceManifest.changed.length} changed)</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Warnings: {snapshotComparison.warnings.added.length} added, {snapshotComparison.warnings.cleared.length} cleared, {snapshotComparison.warnings.unchanged.length} unchanged</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Trace coverage — pruned branches: {snapshotComparison.coverage.earlier.prunedBranches} → {snapshotComparison.coverage.later.prunedBranches}; omitted nodes/links: {snapshotComparison.coverage.earlier.omittedNodes}/{snapshotComparison.coverage.earlier.omittedLinks} → {snapshotComparison.coverage.later.omittedNodes}/{snapshotComparison.coverage.later.omittedLinks}; address history complete: {String(snapshotComparison.coverage.earlier.addressHistoryComplete)} → {String(snapshotComparison.coverage.later.addressHistoryComplete)}</span>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.68rem', margin: 0 }}>Comparison describes stored data only; it does not determine why a trace changed or which capture is more accurate.</p>
      </div>}
      <p style={{ color: 'var(--text-muted)', fontSize: '0.68rem', margin: '0.6rem 0 0' }}>A valid digest only shows that the snapshot payload matches its recorded digest. It does not authenticate the provider, verify chain facts, or establish attribution.</p>
    </section>

    <section className="workflow-section" style={box}>
      <SectionHeader icon={<ClipboardCheck size={16} />} title="Evidence claim ledger" subtitle={`${reviewedClaims} of ${claims.length} records reviewed in this case`} />
      <form onSubmit={submitClaim} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', margin: '0.85rem 0 1rem' }}>
        <select className="select-field" value={draft.classification} onChange={event => setDraft({ ...draft, classification: event.target.value })} aria-label="Claim classification">
          <option>Attribution hypothesis</option><option>External evidence reference</option><option>Investigator-reported outcome</option>
        </select>
        <input className="input-field" style={inputStyle} placeholder="Claim or finding to record" value={draft.statement} onChange={event => setDraft({ ...draft, statement: event.target.value })} required />
        <input className="input-field" style={inputStyle} placeholder="Source / evidence reference" value={draft.sourceReference} onChange={event => setDraft({ ...draft, sourceReference: event.target.value })} required />
        <button className="btn btn-primary" type="submit"><Plus size={14} /> Add claim</button>
      </form>
      {!claims.length ? <Empty text="No evidence claims are available yet. Trace a case or add an investigator-entered reference." /> : <div style={{ display: 'grid', gap: '0.6rem' }}>
        {claims.map(claim => <article className="workflow-record" key={claim.id} style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.8rem', display: 'grid', gap: '0.55rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div><strong style={{ fontSize: '0.82rem' }}>{claim.classification}</strong><p style={{ marginTop: 4, fontSize: '0.8rem' }}>{claim.statement}</p></div>
            <span style={tagStyle}>{claim.review.status.replaceAll('_', ' ')}</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}><strong>Source:</strong> {claim.sourceReference} · {claim.sourceStrength}</div>
          {claim.confidence != null && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Confidence value supplied in stored record: {Math.round(claim.confidence * 100)}% (not independently assessed)</div>}
          <p style={{ fontSize: '0.7rem', color: '#fbbf24' }}>{claim.attributionWarning}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.5rem' }}>
            <select className="select-field" value={claim.review.status} onChange={event => {
              if (event.target.value !== 'unreviewed' && !String(claim.review.reviewerNote || '').trim()) return;
              updateEvidenceClaimReview(claim.id, { ...claim.review, status: event.target.value, reviewedAt: new Date().toISOString() });
            }} aria-label={`Review state for ${claim.classification}`}>
              <option value="unreviewed">Unreviewed</option><option value="reviewed">Reviewed by investigator</option><option value="disputed">Disputed</option><option value="independently_confirmed">Marked independently confirmed</option>
            </select>
            <input className="input-field" placeholder="Reviewer note / independent confirmation reference" value={claim.review.reviewerNote || ''} onChange={event => updateEvidenceClaimReview(claim.id, { ...claim.review, reviewerNote: event.target.value })} aria-label={`Reviewer note for ${claim.classification}`} />
            <span style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: '0.68rem' }}>{claim.review.reviewedAt ? new Date(claim.review.reviewedAt).toLocaleString() : 'Review date not recorded'}</span>
          </div>
          <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Enter a reviewer note before changing review status. Investigator confirmation remains a recorded judgment, not software verification.</span>
        </article>)}
      </div>}
    </section>

    <section className="workflow-section" style={box}>
      <SectionHeader icon={<GitCompareArrows size={16} />} title="Alternative path comparison" subtitle="Candidate simple routes, capped at 30 paths and 10 transfers; ranking is not proof and longer routes may be omitted" />
      {!paths.length ? <Empty text="No bounded source-to-terminal routes were found in this graph." /> : <div style={{ display: 'grid', gap: '0.65rem', marginTop: '0.8rem' }}>
        {paths.map(path => {
          const edit = pathDrafts[path.signature] || path.review;
          return <article className="workflow-record" key={path.id} style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.8rem', display: 'grid', gap: '0.55rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}><strong>Path {path.rank} · {path.hopCount} transfers</strong><span style={tagStyle}>{edit.status.replaceAll('_', ' ')}</span></div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{path.addressPath.join(' → ')}</div>
            <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span>Path bottleneck: {(path.bottleneckSats / 1e8).toFixed(4)} BTC</span><span>Estimated tainted bottleneck: {(path.estimatedTaintedSats / 1e8).toFixed(4)} BTC</span><span>{path.evidenceLabel}</span>
            </div>
            <ol style={{ margin: '0 0 0 1rem', padding: 0, display: 'grid', gap: '0.25rem', fontSize: '0.69rem', color: 'var(--text-muted)' }}>
              {path.transactions.map((transaction, index) => <li key={`${transaction.reference || 'unreferenced'}:${index}`}>Transfer {index + 1}: {transaction.reference || 'transaction reference unavailable'} · {transaction.value} · {transaction.timestamp || 'time unavailable'}</li>)}
            </ol>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.5rem' }}>
              <select className="select-field" value={edit.status} onChange={event => setPathDrafts(previous => ({ ...previous, [path.signature]: { ...edit, status: event.target.value } }))} aria-label={`Assessment for path ${path.rank}`}>
                <option value="unreviewed">Unreviewed</option><option value="selected_for_review">Selected for further review</option><option value="rejected">Rejected by investigator</option><option value="needs_corroboration">Needs corroboration</option>
              </select>
              <input className="input-field" placeholder="Reason and evidence reference (required to decide)" value={edit.rationale || ''} onChange={event => setPathDrafts(previous => ({ ...previous, [path.signature]: { ...edit, rationale: event.target.value } }))} aria-label={`Rationale for path ${path.rank}`} />
              <button className="btn btn-quiet" type="button" disabled={edit.status !== 'unreviewed' && !String(edit.rationale || '').trim()} onClick={() => savePathReview(path)}>Save review</button>
            </div>
          </article>;
        })}
      </div>}
    </section>

    <section className="workflow-section" style={box}>
      <SectionHeader icon={<AlertTriangle size={16} />} title="Evidence gap checklist" subtitle="Automatically derived gaps are prompts for review, not findings of misconduct" />
      {!gaps.length ? <Empty text="No gaps were detected by the current checklist. That does not establish completeness or correctness." /> : <div style={{ display: 'grid', gap: '0.55rem', marginTop: '0.8rem' }}>
        {gaps.map(gap => <div className="evidence-gap" key={gap.id} style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.75rem', display: 'grid', gridTemplateColumns: 'minmax(180px, 0.9fr) 2fr', gap: '0.4rem 0.8rem' }}>
          <strong style={{ fontSize: '0.78rem' }}><span style={{ color: gap.priority === 'high' ? '#f87171' : '#fbbf24', textTransform: 'uppercase', fontSize: '0.65rem', marginRight: 6 }}>{gap.priority}</span>{gap.title}</strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{gap.detail}</span>
          <span style={{ gridColumn: '2', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Next: {gap.recommendation}</span>
        </div>)}
      </div>}
    </section>
  </section>;
}

function SectionHeader({ icon, title, subtitle }) {
  return <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem' }}><span style={{ color: 'var(--primary-accent)' }}>{icon}</span><div><h3 style={{ fontSize: '0.92rem' }}>{title}</h3><p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 3 }}>{subtitle}</p></div></div>;
}

function Empty({ text }) {
  return <div style={{ padding: '1.2rem 0.4rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}><CheckCircle2 size={16} style={{ verticalAlign: 'middle', marginRight: 5 }} />{text}</div>;
}

const tagStyle = { padding: '0.2rem 0.5rem', border: '1px solid var(--border-color)', borderRadius: 999, color: 'var(--text-secondary)', fontSize: '0.68rem', whiteSpace: 'nowrap' };
