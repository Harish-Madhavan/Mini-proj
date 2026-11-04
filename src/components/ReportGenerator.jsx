import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  Printer,
  Trash2,
  Lock,
  LockOpen,
  Upload,
  Download,
  Copy
} from 'lucide-react';
import { useCase } from '../hooks/useCase';
import { useToast } from '../hooks/useToast';
import { ZONAL_UNITS, WATERMARK_OPTIONS, generateEvidenceWorksheetText } from '../constants/legalConstants';
import { convertBtcToFiat } from '../utils/forensicUtils';
import { downloadText } from '../utils/download';
import { calculateTaintMap, formatTaintPct } from '../utils/taintAnalysis';
import { generateForensicNarrative } from '../utils/narrativeGenerator';
import { buildChainOfCustody, verifyChainOfCustody } from '../utils/chainOfCustody';
import { useEndpointProfile } from '../hooks/useEndpointProfile';
import { ENDPOINT_PROFILE_LABELS } from '../services/blockchain/gateway';
import { analyzeCaseCrossChainActivity } from '../utils/crossChainForensics';
import { auditTraceCorrectness } from '../utils/traceVerification';
import { hashEvidencePayload } from '../utils/evidenceIntegrity';
import { hasAttributionEvidenceRecord } from '../utils/attributionEvidence';

function HopRow({ index, label, address, balance }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', fontSize: '0.82rem', padding: '0.55rem 0', borderBottom: '1px solid #eeeeee' }}>
      <span style={{ color: '#999', fontSize: '0.76rem', minWidth: '52px' }}>{index}</span>
      <span style={{ color: '#333', minWidth: '86px' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', flex: 1, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{address}</span>
      <strong style={{ color: '#111', fontWeight: 600 }}>{balance}</strong>
    </div>
  );
}

function TableCell({ children, bold, mono, style, isHeader = false }) {
  const Tag = isHeader ? 'th' : 'td';
  return (
    <Tag style={{
      padding: '0.45rem 0.35rem',
      border: 'none',
      borderBottom: '1px solid #eeeeee',
      fontFamily: mono ? 'monospace' : 'inherit',
      textAlign: 'left',
      color: isHeader ? '#999' : 'inherit',
      fontSize: isHeader ? '0.72rem' : 'inherit',
      fontWeight: isHeader ? 500 : (bold ? 600 : 'normal'),
      ...style
    }}>
      {children}
    </Tag>
  );
}

const shortRef = (ref) => (!ref || ref.length <= 18 ? ref || 'N/A' : `${ref.slice(0, 10)}...${ref.slice(-6)}`);

export default function ReportGenerator() {
  const { activeCase } = useCase();
  const { showToast } = useToast();

  const canvasRef = useRef(null);
  const [reportType, setReportType] = useState('ndps_section67');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [integrityHash, setIntegrityHash] = useState('Computing SHA-256...');
  const [custodyState, setCustodyState] = useState(null);
  const [custodyError, setCustodyError] = useState(null);
  const [signatureRevision, setSignatureRevision] = useState(0);
  const [officerName, setOfficerName] = useState('');
  const [officerBadge, setOfficerBadge] = useState('');
  const [bureauZone, setBureauZone] = useState('');
  const [watermark, setWatermark] = useState(WATERMARK_OPTIONS[0].value);
  const [investigatorNotes, setInvestigatorNotes] = useState('');

  const narrative = useMemo(() => generateForensicNarrative(activeCase), [activeCase]);
  const custody = custodyState?.chain || { events: [], eventCount: 0, gaps: [], terminalHash: null };
  const custodyVerification = custodyState?.verification || {
    valid: false,
    checkedEvents: 0,
    brokenAtSeq: null,
    reason: custodyError || 'Computing SHA-256 chain',
  };
  const custodyStatusLabel = custodyState
    ? custodyVerification.valid ? `INTACT (${custodyVerification.checkedEvents} events)` : `BROKEN at seq ${custodyVerification.brokenAtSeq} — ${custodyVerification.reason}`
    : custodyError ? `UNAVAILABLE — ${custodyError}` : 'COMPUTING SHA-256 chain';
  const traceAudit = useMemo(() => activeCase ? auditTraceCorrectness(activeCase) : null, [activeCase]);
  const crossChainReport = useMemo(() => activeCase ? analyzeCaseCrossChainActivity(activeCase.nodes || [], activeCase.links || []) : null, [activeCase]);
  const reportReceiverAddress = activeCase?.nodes?.find(n => n.type === 'receiver')?.details?.address;
  const endpointProfile = useEndpointProfile(reportReceiverAddress, true);

  useEffect(() => {
    let cancelled = false;
    setCustodyState(null);
    setCustodyError(null);
    Promise.resolve().then(async () => {
      const chain = await buildChainOfCustody(activeCase);
      const verification = await verifyChainOfCustody(chain.events);
      if (!cancelled) setCustodyState({ chain, verification });
    }).catch(error => {
      if (!cancelled) {
        console.error('[report] Failed to compute custody digest:', error);
        setCustodyError(error.message);
      }
    });
    return () => { cancelled = true; };
  }, [activeCase]);

  useEffect(() => {
    if (!activeCase) return undefined;
    let cancelled = false;
    setIntegrityHash('Computing SHA-256...');

    let signatureDataUrl = null;
    try {
      signatureDataUrl = canvasRef.current?.toDataURL('image/png') || null;
    } catch {
      signatureDataUrl = null;
    }

    const payload = {
      schema: 'aegistrace-report-evidence-v1',
      caseData: activeCase,
      reportMetadata: {
        reportType,
        officerName,
        officerBadge,
        bureauZone,
        watermark,
        investigatorNotes,
        signatureDataUrl,
        endpointProfile: {
          status: endpointProfile.status,
          profile: endpointProfile.profile || null,
          error: endpointProfile.error || null
        }
      }
    };

    hashEvidencePayload(payload)
      .then(digest => { if (!cancelled) setIntegrityHash(digest); })
      .catch(() => { if (!cancelled) setIntegrityHash('Unavailable - Web Crypto SHA-256 required'); });

    return () => { cancelled = true; };
  }, [activeCase, reportType, officerName, officerBadge, bureauZone, watermark, investigatorNotes, signatureRevision, endpointProfile.status, endpointProfile.profile, endpointProfile.error]);

  if (!activeCase) return <div style={{ color: 'var(--text-secondary)' }}>Select a case first.</div>;

  const receiverNode = activeCase.nodes.find(n => n.type === 'receiver');
  const suspectNode = activeCase.nodes.find(n => n.type === 'suspect');
  const hops = activeCase.nodes.filter(n => n.type === 'hop');
  const mixer = activeCase.nodes.find(n => n.type === 'mixer');
  const fiatVal = convertBtcToFiat(suspectNode?.balance || activeCase.nodes[0]?.balance || '0 BTC');
  const taintMap = activeCase.nodes.length > 1 ? calculateTaintMap(activeCase.nodes, activeCase.links) : null;
  const receiverTaint = receiverNode && taintMap ? taintMap.get(receiverNode.id) : null;

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.touches ? e.touches[0].clientX : e.clientX) - rect.left,
      y: (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
    };
  };

  const startDrawing = (e) => {
    if (isLocked) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing || isLocked) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) setSignatureRevision(revision => revision + 1);
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setSignatureRevision(revision => revision + 1);
    showToast("Signature cleared.", "info");
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || isLocked) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setSignatureRevision(revision => revision + 1);
          showToast("Image loaded.", "success");
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePrint = () => {
    showToast("Opening print...", "info");
    window.print();
  };

  const getReportMarkdown = () => {
    const notesList = activeCase.notesList || [];
    return `# DRAFT FORENSIC CASE REPORT — FOR REVIEW
**Prepared by:** AegisTrace draft tool (not issued by or on behalf of an agency)  
**Proposed unit (user supplied):** ${bureauZone || 'Not supplied'}  
**Classification:** ${watermark}  
**Trace status:** ${activeCase.traceType === 'SIMULATED_ESTIMATE' ? 'SIMULATED ESTIMATE — NOT ON-CHAIN EVIDENCE' : activeCase.traceType === 'MANUAL_HYPOTHESIS' ? 'USER-SUPPLIED HYPOTHESIS — NOT VERIFIED' : 'Observed trace data; review source provenance and completeness'}<br>
**Case Title:** ${activeCase.title}  
**Application draft reference:** AEGIS-DRAFT-${activeCase.id.toUpperCase()}  
**Date:** ${new Date().toISOString().split('T')[0]}  
**Evidence payload SHA-256 digest:** \`${integrityHash}\`
*This digest covers the complete canonical stored case and report metadata snapshot. It detects changes to that payload; it does not verify source authenticity, attribution, or legal admissibility.*

---

## 1. Summary
- **Starting wallet:** ${activeCase.suspectName}
- **Currency:** ${activeCase.currency}
- **Amount traced:** ${suspectNode?.balance || 'N/A'} (â‰ˆ ${fiatVal.formattedUsd} / ${fiatVal.formattedInr})
- **Risk score:** ${activeCase.riskScore == null ? 'Not assessed (insufficient evidence)' : `${activeCase.riskScore}%`}

## Trace completeness
- Halt reason: ${activeCase.traceMeta?.haltReason || 'Configured depth reached or no further branches'}
- Recorded nodes/links: ${activeCase.traceMeta?.stats?.nodeCount ?? activeCase.nodes?.length ?? 0}/${activeCase.traceMeta?.stats?.linkCount ?? activeCase.links?.length ?? 0}
- Omitted nodes/links: ${activeCase.traceMeta?.stats?.omittedNodeCount ?? 0}/${activeCase.traceMeta?.stats?.omittedLinkCount ?? 0}
- Pruned branches: ${activeCase.traceMeta?.stats?.prunedBranches?.length ?? 0}
${(activeCase.traceMeta?.warnings || []).map(warning => `- Warning: ${warning}`).join('\n')}

## Data collection manifest
${activeCase.traceMeta?.collection
    ? `- Completed: ${activeCase.traceMeta.collection.completedAt}; requested depth: ${activeCase.traceMeta.collection.requestedDepth}; each response digest is over canonicalized parsed JSON, not the original wire bytes.\n${(activeCase.traceMeta.collection.sourceManifest || []).map(entry => `- ${entry.txid}: block ${entry.blockHeight ?? 'unconfirmed/unknown'}, hash ${entry.blockHash || 'not supplied by provider'}; transaction provider ${entry.transactionResponse?.provider || 'unknown'}${entry.transactionResponse?.cacheHit ? ' (cached)' : ''}, digest ${entry.transactionResponse?.canonicalResponseSha256 || 'unavailable'}; outspends provider ${entry.outspendsResponse?.provider || 'unknown'}${entry.outspendsResponse?.cacheHit ? ' (cached)' : ''}, digest ${entry.outspendsResponse?.canonicalResponseSha256 || 'unavailable'}`).join('\n')}`
    : '- No per-response source manifest recorded.'}

## 2. Transaction steps
${(activeCase.links || []).map((link, i) => `${i + 1}. \`${link.source}\` âž” \`${link.target}\` | **${link.value}** (${link.timestamp || 'On-chain'})`).join('\n')}

## Address history scan scope
${activeCase.traceMeta?.addressHistoryScan
    ? `- Pages scanned: ${activeCase.traceMeta.addressHistoryScan.pagesScanned}; transactions scanned: ${activeCase.traceMeta.addressHistoryScan.transactionsScanned}; full history scan: ${activeCase.traceMeta.addressHistoryScan.complete ? 'yes' : 'no'}${activeCase.traceMeta.addressHistoryScan.incompleteReason ? `; note: ${activeCase.traceMeta.addressHistoryScan.incompleteReason}` : ''}`
    : '- Not applicable or not recorded.'}

## 3. End receiver
- **Endpoint:** ${receiverNode?.entityName || 'Unresolved'}
- **Address:** \`${receiverNode?.details?.address || 'N/A'}\`
- **Entity attribution:** ${hasAttributionEvidenceRecord(receiverNode) ? `Evidence record attached (${receiverNode.details.identityEvidence.source}); review source and scope` : 'Owner or service not established by available evidence'}
- **Amount:** ${receiverNode?.balance || 'N/A'}

## 4. Field notes (${notesList.length} entries)
${notesList.length > 0 ? notesList.map((n, i) => `${i + 1}. [${new Date(n.timestamp).toLocaleString()}] **${n.author}:** ${n.content}`).join('\n') : '*No specific field notes recorded for this case.*'}

## 5. Findings
**${narrative?.headline || 'Standard on-chain flow'}**
${narrative?.summary || ''}
**Findings:**
${(narrative?.findings || []).map(f => `- ${f}`).join('\n')}
**Limits:**
${(narrative?.limitations || []).map(l => `- ${l}`).join('\n')}

## 6. Transfer event sequence (SHA-256 digest chain; not externally anchored)
- Transfers sealed: ${custody.eventCount} Â· Verification: ${custodyStatusLabel}
- Terminal event digest (SHA-256; no external signature or trusted timestamp): \`${custody.terminalHash || 'N/A'}\`
${custody.gaps.length > 0 ? custody.gaps.map(g => `- Gap after seq ${g.afterSeq} [${g.kind}]: ${g.note}`).join('\n') : '- No custody gaps flagged.'}

## 7. Internal consistency checks (not proof of path accuracy or ownership)
- Check status: **${traceAudit?.rating || 'INCOMPLETE'}** (${traceAudit?.isComplete ? `${traceAudit.consistencyScore}/100 internal consistency score` : 'score withheld because required checks were unavailable'})
- Invariants: Value Conservation [${traceAudit?.invariants?.valueConservation?.status || 'unknown'}], Causality [${traceAudit?.invariants?.temporalCausality?.status || 'unknown'}], Heuristic Consistency [${traceAudit?.invariants?.heuristicConsistency?.status || 'unknown'}], Taint Conservation [${traceAudit?.invariants?.taintConservation?.status || 'unknown'}]
- Multi-Model Concordance: ${traceAudit?.concordance?.status === 'checked' ? `${Math.round(traceAudit.concordance.score * 100)}% agreement across selected taint models` : 'unknown (not applicable or no seeded value flow)'}
- Summary: ${traceAudit?.summary || 'N/A'}

## 8. Cross-Chain Protocol Activity
${crossChainReport && crossChainReport.crossChainHops?.length > 0 ? crossChainReport.crossChainHops.map((h, i) => `${i + 1}. **${h.bridgeName}**: Destination Chain: ${h.destinationChain} (${h.targetAsset}) | Memo Target: \`${h.destinationAddress}\``).join('\n') : '- No cross-chain bridge memo operations identified.'}

## 9. Officer remarks
${investigatorNotes}

---
**Reviewer (user supplied):** ${officerName || 'Not supplied'} [Identifier: ${officerBadge || 'Not supplied'}]  
*Draft analytical aid only. No authority, signature, certification, legal admissibility, or source authenticity is provided by this application.*
`;
  };

  const getEvidenceWorksheetText = () => generateEvidenceWorksheetText({
    caseId: activeCase.id,
    caseTitle: activeCase.title,
    officerName,
    officerBadge,
    integrityHash,
    nodesCount: activeCase.nodes?.length || 0,
    hopsCount: activeCase.links?.length || 0,
    initialTxHash: activeCase.initialTxHash,
    depositAddress: receiverNode?.details?.address || 'Not established',
    attributedAmount: receiverNode?.balance || 'Not established',
    identityEvidenceSource: hasAttributionEvidenceRecord(receiverNode) ? receiverNode.details.identityEvidence.source : null
  });

  const isEvidence = reportType === 'evidence_section65b';

  const handleCopy = () => {
    const text = isEvidence ? getEvidenceWorksheetText() : getReportMarkdown();
    navigator.clipboard.writeText(text);
    showToast(isEvidence ? "Evidence worksheet copied." : "Report copied.", "success");
  };

  const handleExport = () => {
    const text = isEvidence ? getEvidenceWorksheetText() : getReportMarkdown();
    const filename = isEvidence
      ? `AegisTrace-Evidence-Worksheet-${activeCase.id.toUpperCase()}.txt`
      : `AegisTrace-Draft-Report-${activeCase.id.toUpperCase()}.md`;
    downloadText(text, filename);
    showToast(isEvidence ? "Evidence worksheet downloaded." : "Report downloaded.", "success");
  };

  const toggleLock = () => {
    const nextLocked = !isLocked;
    setIsLocked(nextLocked);
    showToast(nextLocked ? "Report locked." : "Report unlocked.", nextLocked ? "success" : "info");
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Minimal format switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.25rem' }} role="tablist" aria-label="Report format">
          <button
            onClick={() => setReportType('ndps_section67')}
            className={!isEvidence ? 'btn btn-primary' : 'btn-quiet'}
            type="button"
            role="tab"
            aria-selected={!isEvidence}
            style={{ fontSize: '0.82rem' }}
          >
            Report
          </button>
          <button
            onClick={() => setReportType('evidence_section65b')}
            className={isEvidence ? 'btn btn-primary' : 'btn-quiet'}
            type="button"
            role="tab"
            aria-selected={isEvidence}
            style={{ fontSize: '0.82rem' }}
          >
            Evidence worksheet
          </button>
        </div>

        <button onClick={handlePrint} className="btn btn-primary" type="button" style={{ fontSize: '0.82rem' }}>
          <Printer size={14} /> Print
        </button>
      </div>

      <div className="responsive-split-grid" style={{ display: 'grid', gridTemplateColumns: '3fr 1.5fr', gap: '2rem' }}>
        
        {/* Printable Area */}
        <div className="glass-panel" id="printable-area" style={{ position: 'relative', padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1.75rem', backgroundColor: '#ffffff', color: '#1a1a1a', borderRadius: '10px', overflow: 'hidden' }}>
          <div className="report-watermark">{watermark}</div>

          {isEvidence ? (
            /* Non-certifying evidence worksheet */
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem', lineHeight: '1.65' }}>
              <div style={{ textAlign: 'center', borderBottom: '1px solid #e5e5e5', paddingBottom: '1.25rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.01em', color: '#1a1a1a' }}>
                  Draft evidence metadata worksheet
                </h2>
                <span style={{ fontSize: '0.78rem', color: '#b45309' }}>Not a certificate, affidavit, or verified report</span>
              </div>

              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '0.75rem', fontSize: '0.8rem', color: '#78350f' }}>
                Values below are application-stored records. This software does not verify their source, legal sufficiency, ownership, or admissibility. Review independently before relying on or filing them.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem', fontSize: '0.82rem' }}>
                <div><span>Case title (stored)</span><br /><strong>{activeCase.title || 'Not provided'}</strong></div>
                <div><span>Case ID (stored)</span><br /><strong>{activeCase.id || 'Not provided'}</strong></div>
                <div><span>Officer name (user-entered)</span><br /><strong>{officerName || 'Not provided'}</strong></div>
                <div><span>Officer reference (user-entered)</span><br /><strong>{officerBadge || 'Not provided'}</strong></div>
                <div><span>Graph records (not validated transaction count)</span><br /><strong>{activeCase.nodes?.length || 0} nodes Â· {activeCase.links?.length || 0} links</strong></div>
                <div><span>Initial transaction reference (stored)</span><br /><strong>{activeCase.initialTxHash || 'Not provided'}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><span>Recorded endpoint address</span><br /><code style={{ wordBreak: 'break-all' }}>{receiverNode?.details?.address || 'Not established'}</code></div>
                <div><span>Endpoint owner or service</span><br /><strong>{hasAttributionEvidenceRecord(receiverNode) ? `Attribution evidence recorded (${receiverNode.details.identityEvidence.source}); not independently verified` : 'Not established'}</strong></div>
                <div><span>Recorded endpoint amount</span><br /><strong>{receiverNode?.balance || 'Not established'} (not confirmed seized or recoverable)</strong></div>
              </div>

              <div>
                <h4 style={{ fontSize: '0.8rem', fontWeight: 600 }}>Evidence payload SHA-256 digest</h4>
                <div style={{ backgroundColor: '#f7f7f7', padding: '0.6rem 0.8rem', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.72rem', color: '#333', wordBreak: 'break-all' }}>{integrityHash}</div>
                <p style={{ fontSize: '0.74rem', color: '#666' }}>Covers the complete stored case and report metadata snapshot. Detects changes to that snapshot; it does not verify source authenticity, attribution, or legal admissibility.</p>
              </div>

              <div>
                <h4 style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: '#1a1a1a' }}>Stored graph records (labels are not identity findings)</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <TableCell isHeader>#</TableCell>
                      <TableCell isHeader>Stored label</TableCell>
                      <TableCell isHeader>Address or reference</TableCell>
                      <TableCell isHeader>Recorded amount</TableCell>
                      <TableCell isHeader>Graph type</TableCell>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCase.nodes.map((n, i) => (
                      <tr key={n.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>{n.label || n.entityName || 'Unlabeled'}</TableCell>
                        <TableCell mono>{n.details?.address ? `${n.details.address.slice(0, 10)}...${n.details.address.slice(-8)}` : n.id}</TableCell>
                        <TableCell bold>{n.balance}</TableCell>
                        <TableCell>{n.type}</TableCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '1rem', fontSize: '0.78rem', color: '#555' }}>
                Independent reviewer, source records, collection method/time, system details, and applicable legal requirements must be documented outside this template.
              </div>
            </div>
          ) : (
            /* SECTION 67 NDPS STANDARD REPORT VIEW */
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #e5e5e5', paddingBottom: '1rem', position: 'relative', zIndex: 1 }}>
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.01em' }}>Narcotics Control Bureau</h2>
                  <p style={{ fontSize: '0.78rem', color: '#888', marginTop: '0.15rem' }}>
                    {bureauZone}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.76rem', color: '#888' }}>{getRefCode()}-{activeCase.id.toUpperCase()}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1rem', fontSize: '0.84rem', position: 'relative', zIndex: 1 }}>
                <div>
                  <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>Case</span>
                  <strong style={{ color: '#1a1a1a' }}>{activeCase.title}</strong>
                </div>
                <div>
                  <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>Subject</span>
                  <strong style={{ color: '#1a1a1a' }}>{activeCase.suspectName}</strong>
                </div>
                <div>
                  <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>Amount</span>
                  <strong style={{ color: '#1a1a1a' }}>{suspectNode?.balance || 'N/A'} (â‰ˆ {fiatVal.formattedUsd})</strong>
                </div>
                <div>
                  <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>Risk</span>
                  <strong style={{ color: '#1a1a1a' }}>{activeCase.riskScore == null ? 'Not assessed' : `${activeCase.riskScore}%`}</strong>
                </div>
                <div>
                  <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>Trace status</span>
                  <strong style={{ color: '#1a1a1a' }}>
                    {activeCase.traceType === 'SIMULATED_ESTIMATE' ? 'Simulated — not on-chain evidence'
                      : activeCase.traceType === 'MANUAL_HYPOTHESIS' ? 'User-supplied — not verified'
                        : 'Observed trace — provenance review required'}
                  </strong>
                </div>
              </div>

              {narrative && (
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <h4 style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1a1a1a', marginBottom: '0.4rem' }}>
                    Summary
                  </h4>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a1a1a', marginBottom: '0.3rem' }}>{narrative.headline}</p>
                  <p style={{ fontSize: '0.82rem', color: '#444', marginBottom: '0.5rem' }}>{narrative.summary}</p>
                  <ul style={{ margin: '0 0 0 1rem', padding: 0, fontSize: '0.8rem', color: '#333' }}>
                    {narrative.findings.map((f, i) => <li key={i} style={{ marginBottom: '0.2rem' }}>{f}</li>)}
                  </ul>
                  <p style={{ fontSize: '0.76rem', color: '#999', marginTop: '0.5rem' }}>Limits: {narrative.limitations.join(' ')}</p>
                </div>
              )}

              <div style={{ position: 'relative', zIndex: 1 }}>
                <h4 style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1a1a1a', marginBottom: '0.25rem' }}>
                  Transaction steps
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <HopRow
                    index="01" label="Start"
                    address={suspectNode?.details?.address || suspectNode?.id || 'N/A'}
                    balance={suspectNode?.balance || '0 BTC'}
                  />
                  {mixer && (
                    <HopRow
                      index="Â·Â·" label="Mixer"
                      address={mixer.details?.address || mixer.id}
                      balance={mixer.balance}
                    />
                  )}
                  {hops.map((hop, idx) => (
                    <HopRow
                      key={idx}
                      index={String(idx + 2).padStart(2, '0')} label="Hop"
                      address={hop.details?.address || hop.id}
                      balance={hop.balance}
                    />
                  ))}
                  {receiverNode && (
                    <HopRow
                      index="â†’" label="Receiver"
                      address={receiverNode.details?.address || receiverNode.id}
                      balance={receiverNode.balance}
                    />
                  )}
                </div>
              </div>

              {receiverNode && (
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <h4 style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1a1a1a', marginBottom: '0.4rem' }}>
                    End receiver
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.82rem' }}>
                    <div>
                      <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>Endpoint</span>
                      <strong style={{ color: '#1a1a1a' }}>{receiverNode.entityName}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>Entity attribution</span>
                      <strong style={{ color: '#1a1a1a' }}>{hasAttributionEvidenceRecord(receiverNode) ? `Evidence recorded: ${receiverNode.details.identityEvidence.source}` : 'Owner or service not established'}</strong>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>Address</span>
                      <span style={{ fontFamily: 'monospace', color: '#333', fontSize: '0.78rem', wordBreak: 'break-all' }}>{receiverNode.details.address}</span>
                    </div>
                    <div>
                      <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>Amount</span>
                      <strong style={{ color: '#1a1a1a' }}>{receiverNode.balance}</strong>
                    </div>
                    {endpointProfile.status === 'ready' && endpointProfile.profile && (
                      <div>
                        <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>History</span>
                        <strong style={{ color: '#1a1a1a' }}>
                          {ENDPOINT_PROFILE_LABELS[endpointProfile.profile.profile] || endpointProfile.profile.profile}
                          {' '}({(endpointProfile.profile.totalReceivedSats / 1e8).toFixed(4)} BTC Â· {endpointProfile.profile.txCount} txs)
                        </strong>
                      </div>
                    )}
                    {receiverTaint != null && (
                      <div>
                        <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>Traced share</span>
                        <strong style={{ color: '#1a1a1a' }}>{formatTaintPct(receiverTaint)}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Cross-Chain Foreign Ledger Exits */}
              {crossChainReport?.detected && (
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <h4 style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1a1a1a', marginBottom: '0.4rem' }}>
                    Cross-chain exits ({crossChainReport.bridgeCount} â†’ {crossChainReport.targetChains.join(', ')})
                  </h4>
                  <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <TableCell isHeader>Protocol</TableCell>
                        <TableCell isHeader>Destination</TableCell>
                        <TableCell isHeader>Address</TableCell>
                      </tr>
                    </thead>
                    <tbody>
                      {crossChainReport.hops.map((hop, idx) => (
                        <tr key={idx}>
                          <TableCell>{hop.bridgeName}</TableCell>
                          <TableCell>{hop.destinationChain} ({hop.targetAsset})</TableCell>
                          <TableCell mono>{hop.destinationAddress}</TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Chain of custody */}
              {custody.eventCount > 0 && (
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <h4 style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1a1a1a', marginBottom: '0.4rem' }}>
                    Transfer-event digest trail · {custodyStatusLabel}
                  </h4>
                  <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <TableCell isHeader>#</TableCell>
                        <TableCell isHeader>Transfer</TableCell>
                        <TableCell isHeader>BTC</TableCell>
                        <TableCell isHeader>Seal</TableCell>
                      </tr>
                    </thead>
                    <tbody>
                      {custody.events.map(e => (
                        <tr key={e.seq}>
                          <TableCell>{e.seq}</TableCell>
                          <TableCell mono>{shortRef(e.from)} â†’ {shortRef(e.to)}{e.approximateOrder ? ' *' : ''}</TableCell>
                          <TableCell bold>{e.amountBtc.toFixed(4)}</TableCell>
                          <TableCell mono>{e.eventHash.slice(0, 8)}â€¦</TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mono-addr" style={{ fontSize: '0.7rem', color: '#999', marginTop: '0.35rem', wordBreak: 'break-all' }}>
                    {custody.terminalHash}
                    {custody.gaps.length > 0 && ` Â· ${custody.gaps.map(g => g.note).join(' ')}`}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: '#777' }}>
                    SHA-256 detects changes to this event sequence; it is not signed or externally anchored and does not prove source authenticity or legal custody.
                  </p>
                </div>
              )}

              {/* Trace Verification & Invariant Audit */}
              {traceAudit && traceAudit.isAudited && (
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <h4 style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1a1a1a', marginBottom: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Trace consistency checks</span>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.45rem',
                      borderRadius: '4px',
                      backgroundColor: traceAudit.rating === 'CONSISTENT' ? 'rgba(16, 185, 129, 0.12)' : traceAudit.rating === 'INCOMPLETE' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      color: traceAudit.rating === 'CONSISTENT' ? '#059669' : traceAudit.rating === 'INCOMPLETE' ? '#b45309' : '#dc2626'
                    }}>
                      {traceAudit.rating}{traceAudit.consistencyScore != null ? ` Â· ${traceAudit.consistencyScore}% consistency` : ' Â· score unavailable'}
                    </span>
                  </h4>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '0.6rem', fontSize: '0.76rem', color: '#334155' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.35rem', marginBottom: '0.4rem' }}>
                      <div>â€¢ Value conservation: <strong>{traceAudit.invariants?.valueConservation?.status || 'unknown'}</strong></div>
                      <div>â€¢ Temporal causality: <strong>{traceAudit.invariants?.temporalCausality?.status || 'unknown'}</strong></div>
                      <div>â€¢ Heuristic consistency: <strong>{traceAudit.invariants?.heuristicConsistency?.status || 'unknown'}</strong></div>
                      <div>â€¢ Taint conservation: <strong>{traceAudit.invariants?.taintConservation?.status || 'unknown'}</strong></div>
                      <div>â€¢ Multi-model agreement: <strong>{traceAudit.concordance?.score == null ? 'unknown' : `${Math.round(traceAudit.concordance.score * 100)}%`}</strong></div>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b' }}>
                      {traceAudit.summary}
                    </p>
                  </div>
                </div>
              )}

              {/* Field notes */}
              {activeCase.notesList && activeCase.notesList.length > 0 && (
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <h4 style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Field notes ({activeCase.notesList.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {activeCase.notesList.map((n, i) => (
                      <div key={i} style={{ fontSize: '0.8rem', color: '#333', display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.35rem 0', borderBottom: i < activeCase.notesList.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                        <span><strong>{n.author}:</strong> {n.content}</span>
                        <span style={{ color: '#999', flexShrink: 0 }}>{new Date(n.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Officer remarks */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <label style={{ fontSize: '0.78rem', color: '#999', display: 'block', marginBottom: '0.25rem' }}>Officer remarks</label>
                <textarea
                  rows={2}
                  disabled={isLocked}
                  value={investigatorNotes}
                  onChange={(e) => setInvestigatorNotes(e.target.value)}
                  style={{
                    width: '100%',
                    fontSize: '0.82rem',
                    color: '#1a1a1a',
                    border: isLocked ? 'none' : '1px solid #e5e5e5',
                    backgroundColor: isLocked ? 'transparent' : '#fafafa',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    resize: 'none'
                  }}
                />
              </div>

              {/* Dynamic signature is never included on the evidence worksheet. */}
              {!isEvidence && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.5rem', fontSize: '0.82rem', borderTop: '1px solid #e5e5e5', paddingTop: '1rem', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: '55%' }}>
                  <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>Integrity hash</span>
                  <span className="mono-addr" style={{ fontSize: '0.7rem', color: '#333', wordBreak: 'break-all' }}>
                    {integrityHash}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ color: '#999', fontSize: '0.74rem' }}>Signature image (not digitally signed)</span>
                  <div style={{ position: 'relative', border: isLocked ? 'none' : '1px dashed #ddd', borderRadius: '6px', backgroundColor: '#fafafa' }}>
                    <canvas
                      ref={canvasRef}
                      width="180"
                      height="70"
                      role="img"
                      aria-label="Investigating officer signature pad"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      style={{ display: 'block', cursor: isLocked ? 'default' : 'crosshair', touchAction: 'none' }}
                    />
                    {!isLocked && (
                      <div className="no-print" style={{ position: 'absolute', bottom: '2px', right: '2px', display: 'flex', gap: '0.25rem' }}>
                        <label style={{ padding: '0.2rem 0.35rem', background: '#f0f0f0', border: 'none', color: '#666', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Upload signature image">
                          <Upload size={12} />
                          <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                        </label>
                        <button onClick={clearSignature} style={{ padding: '0.2rem 0.35rem', background: '#f0f0f0', border: 'none', color: '#666', borderRadius: '4px', cursor: 'pointer' }} title="Clear signature">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <input
                      type="text"
                      value={officerName}
                      onChange={(e) => !isLocked && setOfficerName(e.target.value)}
                      style={{
                        border: isLocked ? 'none' : '1px solid #e5e5e5',
                        textAlign: 'center',
                        fontWeight: 600,
                        color: '#1a1a1a',
                        background: 'transparent',
                        fontSize: '0.8rem',
                        outline: 'none',
                        padding: '2px'
                      }}
                    />
                    <p style={{ color: '#999', fontSize: '0.7rem' }}>{officerBadge} Â· {bureauZone}</p>
                  </div>
                </div>
              </div>}
            </>
          )}
        </div>

        {/* Options Panel */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: 'fit-content' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>
            Settings
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Watermark
            </label>
            <select value={watermark} disabled={isLocked} onChange={(e) => setWatermark(e.target.value)} className="select-field" style={{ width: '100%' }}>
              {WATERMARK_OPTIONS.map((wo, idx) => (
                <option key={idx} value={wo.value}>{wo.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Office
            </label>
            <select value={bureauZone} disabled={isLocked} onChange={(e) => setBureauZone(e.target.value)} className="select-field" style={{ width: '100%' }}>
              {ZONAL_UNITS.map((zu, idx) => (
                <option key={idx} value={zu.value}>{zu.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Badge</label>
            <input type="text" disabled={isLocked} value={officerBadge} onChange={(e) => setOfficerBadge(e.target.value)} className="input-field" style={{ width: '100%' }} />
          </div>

          <hr className="divider" />

          <button
            onClick={toggleLock}
            className="btn-quiet"
            style={{ justifyContent: 'center' }}
          >
            {isLocked ? <Lock size={13} /> : <LockOpen size={13} />}
            {isLocked ? "Unlock" : "Lock"}
          </button>
          
          <button onClick={handleCopy} className="btn-quiet" style={{ justifyContent: 'center' }}>
            <Copy size={13} /> Copy text
          </button>

          <button onClick={handleExport} className="btn-quiet" style={{ justifyContent: 'center' }}>
            <Download size={13} /> Export
          </button>

          <button onClick={handlePrint} className="btn btn-primary" style={{ justifyContent: 'center' }}>
            <Printer size={14} /> Print / PDF
          </button>
        </div>

      </div>
    </div>
  );
}
