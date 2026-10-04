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
import { ZONAL_UNITS, WATERMARK_OPTIONS, generateSection65BCertificateText } from '../constants/legalConstants';
import { convertBtcToFiat } from '../utils/forensicUtils';
import { downloadText } from '../utils/download';
import { calculateTaintMap, formatTaintPct } from '../utils/taintAnalysis';
import { generateForensicNarrative } from '../utils/narrativeGenerator';
import { buildChainOfCustody, verifyChainOfCustody } from '../utils/chainOfCustody';
import { useEndpointProfile } from '../hooks/useEndpointProfile';
import { ENDPOINT_PROFILE_LABELS } from '../utils/bitcoinApi';
import { analyzeCaseCrossChainActivity } from '../utils/crossChainForensics';
import { auditTraceCorrectness } from '../utils/traceVerification';

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
  const [integrityHash, setIntegrityHash] = useState('');
  const [officerName, setOfficerName] = useState('Inspector R. Sharma');
  const [officerBadge, setOfficerBadge] = useState('NCB-84920-LE');
  const [bureauZone, setBureauZone] = useState('NCB Head Office, New Delhi');
  const [watermark, setWatermark] = useState(WATERMARK_OPTIONS[0].value);
  const [investigatorNotes, setInvestigatorNotes] = useState(
    'The trail runs through several middle wallets to a domestic exchange. Section 67 notice approved.'
  );

  useEffect(() => {
    if (!activeCase) return;
    const dataStr = `${activeCase.id}-${activeCase.initialTxHash}-${activeCase.riskScore}-${bureauZone}-${officerBadge}-${activeCase.nodes?.length || 0}`;
    let cancelled = false;

    async function computeHash() {
      try {
        if (window.crypto?.subtle) {
          const enc = new TextEncoder().encode(dataStr);
          const digest = await window.crypto.subtle.digest('SHA-256', enc);
          const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
          if (!cancelled) setIntegrityHash(`SHA256:${hex}`);
          return;
        }
      } catch {
        // Fallback below
      }
      let hash = 0;
      for (let i = 0; i < dataStr.length; i++) {
        hash = (hash << 5) - hash + dataStr.charCodeAt(i);
        hash |= 0;
      }
      const hexHash = Math.abs(hash).toString(16).padStart(8, '0') +
                      Math.abs(hash * 3).toString(16).padStart(8, '0') +
                      Math.abs(hash * 7).toString(16).padStart(8, '0') +
                      Math.abs(hash * 13).toString(16).padStart(8, '0');
      if (!cancelled) setIntegrityHash(`SHA256:${hexHash.toUpperCase()} (pseudo)`);
    }

    computeHash();
    return () => { cancelled = true; };
  }, [activeCase, bureauZone, officerBadge]);

  const narrative = useMemo(() => generateForensicNarrative(activeCase), [activeCase]);
  const custody = useMemo(() => buildChainOfCustody(activeCase), [activeCase]);
  const custodyVerification = useMemo(() => verifyChainOfCustody(custody.events), [custody]);
  const traceAudit = useMemo(() => activeCase ? auditTraceCorrectness(activeCase) : null, [activeCase]);
  const crossChainReport = useMemo(() => activeCase ? analyzeCaseCrossChainActivity(activeCase.nodes || [], activeCase.links || []) : null, [activeCase]);
  const reportReceiverAddress = activeCase?.nodes?.find(n => n.type === 'receiver')?.details?.address;
  const endpointProfile = useEndpointProfile(reportReceiverAddress, true);

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

  const stopDrawing = () => setIsDrawing(false);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
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

  const getRefCode = () => {
    if (bureauZone.includes('Head Office')) return 'NCB/HQ/ND';
    if (bureauZone.includes('Mumbai')) return 'NCB/MZU/MUM';
    if (bureauZone.includes('Bengaluru')) return 'NCB/BZU/BLR';
    return 'NCB/CIU/CH';
  };

  const getReportMarkdown = () => {
    const notesList = activeCase.notesList || [];
    return `# NARCOTICS CONTROL BUREAU (NCB) — FORENSIC REPORT
**Issuing Zonal Unit:** ${bureauZone}  
**Classification:** ${watermark}  
**Case Title:** ${activeCase.title}  
**Case Ref:** ${getRefCode()}-${activeCase.id.toUpperCase()}  
**Date:** ${new Date().toISOString().split('T')[0]}  
**Cryptographic Seal:** \`${integrityHash}\`  

---

## 1. Summary
- **Starting wallet:** ${activeCase.suspectName}
- **Currency:** ${activeCase.currency}
- **Amount traced:** ${suspectNode?.balance || 'N/A'} (≈ ${fiatVal.formattedUsd} / ${fiatVal.formattedInr})
- **Risk score:** ${activeCase.riskScore}%

## 2. Transaction steps
${(activeCase.links || []).map((link, i) => `${i + 1}. \`${link.source}\` ➔ \`${link.target}\` | **${link.value}** (${link.timestamp || 'On-chain'})`).join('\n')}

## 3. End receiver
- **Endpoint:** ${receiverNode?.entityName || 'Unresolved'}
- **Address:** \`${receiverNode?.details?.address || 'N/A'}\`
- **Identity check:** ${receiverNode?.details?.kycStatus || 'N/A'}
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

## 6. Chain of Custody (Hash-Sealed)
- Transfers sealed: ${custody.eventCount} · Verification: ${custodyVerification.valid ? `INTACT (${custodyVerification.checkedEvents} events)` : `BROKEN at seq ${custodyVerification.brokenAtSeq} — ${custodyVerification.reason}`}
- Terminal seal: \`${custody.terminalHash || 'N/A'}\`
${custody.gaps.length > 0 ? custody.gaps.map(g => `- Gap after seq ${g.afterSeq} [${g.kind}]: ${g.note}`).join('\n') : '- No custody gaps flagged.'}

## 7. Mathematical Invariant & Trace Verification
- Verification Status: **${traceAudit?.rating || 'UNPROVEN'}** (${traceAudit?.assuranceScore ?? 0}% Assurance)
- Invariants: Value Conservation [${traceAudit?.invariants?.valueConservation?.passed ? 'PASSED' : 'FAILED'}], Causality [${traceAudit?.invariants?.temporalCausality?.passed ? 'PASSED' : 'FAILED'}], Taint Non-Inflation [${traceAudit?.invariants?.taintConservation?.passed ? 'PASSED' : 'FAILED'}]
- Multi-Model Concordance: ${Math.round((traceAudit?.concordance?.score || 0) * 100)}% agreement across FIFO, Proportional, and Poison judicial models
- Summary: ${traceAudit?.summary || 'N/A'}

## 8. Officer remarks
${investigatorNotes}

---
**Officer:** ${officerName} [Badge: ${officerBadge}]  
*Narcotics Control Bureau, Ministry of Home Affairs, Government of India*
`;
  };

  const getSection65BText = () => generateSection65BCertificateText({
    zonalUnit: bureauZone,
    firNumber: `NCB/NDPS/CR-${activeCase.id.slice(-4).toUpperCase()}/2026`,
    caseTitle: activeCase.title,
    officerName,
    officerBadge,
    integrityHash,
    nodesCount: activeCase.nodes?.length || 0,
    hopsCount: activeCase.links?.length || 0,
    initialTxHash: activeCase.initialTxHash,
    targetExchange: receiverNode?.entityName || 'Domestic exchange',
    depositAddress: receiverNode?.details?.address || 'N/A',
    totalSeizedBtc: suspectNode?.balance || '0.0000 BTC'
  });

  const isEvidence = reportType === 'evidence_section65b';

  const handleCopy = () => {
    const text = isEvidence ? getSection65BText() : getReportMarkdown();
    navigator.clipboard.writeText(text);
    showToast(isEvidence ? "Certificate copied." : "Report copied.", "success");
  };

  const handleExport = () => {
    const text = isEvidence ? getSection65BText() : getReportMarkdown();
    const filename = isEvidence
      ? `NCB-Section65B-Certificate-${activeCase.id.toUpperCase()}.txt`
      : `NCB-Forensic-Report-${activeCase.id.toUpperCase()}.md`;
    downloadText(text, filename);
    showToast(isEvidence ? "Certificate downloaded." : "Report downloaded.", "success");
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
            Certificate
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
            /* SECTION 65B EVIDENCE ACT AFFIDAVIT VIEW */
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem', lineHeight: '1.65' }}>
              <div style={{ textAlign: 'center', borderBottom: '1px solid #e5e5e5', paddingBottom: '1.25rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.01em', color: '#1a1a1a' }}>
                  Narcotics Control Bureau — Certificate u/s 65B IEA / Sec. 63 BSA
                </h2>
                <span style={{ fontSize: '0.78rem', color: '#888' }}>
                  {bureauZone}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#888', paddingBottom: '0.25rem' }}>
                <span>Ref: NCB/NDPS/CR-{activeCase.id.slice(-4).toUpperCase()}/2026</span>
                <span>{new Date().toISOString().split('T')[0]}</span>
              </div>

              <div style={{ fontSize: '0.85rem', color: '#333', textAlign: 'justify' }}>
                <p style={{ marginBottom: '0.75rem' }}>
                  I, <strong>{officerName}</strong> ({officerBadge}), {bureauZone}, affirm on oath:
                </p>
                <p style={{ marginBottom: '0.75rem' }}>
                  <strong>1. Authority.</strong> I am the Investigating Officer in <em>"{activeCase.title}"</em>, authorised to extract and certify electronic records of on-chain fund flows.
                </p>
                <p style={{ marginBottom: '0.75rem' }}>
                  <strong>2. System integrity.</strong> The trace was generated on an isolated NCB workstation operating properly throughout the material period.
                </p>
                <p style={{ marginBottom: '0.5rem' }}>
                  <strong>3. Manifest & hash.</strong> {activeCase.nodes?.length || 0} nodes and {activeCase.links?.length || 0} steps, sealed under:
                </p>
                <div style={{ backgroundColor: '#f7f7f7', padding: '0.6rem 0.8rem', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.72rem', color: '#333', margin: '0.5rem 0', wordBreak: 'break-all' }}>
                  {integrityHash}
                </div>
                <p style={{ marginTop: '0.75rem' }}>
                  <strong>4. End receiver.</strong> Funds terminate at <code style={{ fontFamily: 'monospace', backgroundColor: '#f0f0f0', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{receiverNode?.details?.address || 'N/A'}</code> ({receiverNode?.entityName || 'Domestic exchange'}, {receiverNode?.balance || '0 BTC'}).
                </p>
              </div>

              {/* Manifest Table */}
              <div>
                <h4 style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: '#1a1a1a' }}>
                  Exhibit schedule
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <TableCell isHeader>#</TableCell>
                      <TableCell isHeader>Entity</TableCell>
                      <TableCell isHeader>Address</TableCell>
                      <TableCell isHeader>Value</TableCell>
                      <TableCell isHeader>Role</TableCell>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCase.nodes.map((n, i) => (
                      <tr key={n.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>{n.entityName || n.label}</TableCell>
                        <TableCell mono>{n.details?.address ? `${n.details.address.slice(0, 10)}...${n.details.address.slice(-8)}` : n.id}</TableCell>
                        <TableCell bold>{n.balance}</TableCell>
                        <TableCell>{n.type}</TableCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '0.5rem', borderTop: '1px solid #e5e5e5', paddingTop: '1rem', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <p>{bureauZone.split(',')[0]} · {new Date().toISOString().split('T')[0]}</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ borderBottom: '1px solid #1a1a1a', width: '170px', marginBottom: '0.25rem' }}></div>
                  <strong style={{ display: 'block' }}>{officerName}</strong>
                  <span style={{ fontSize: '0.74rem', color: '#888' }}>Investigating Officer</span>
                </div>
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
                  <strong style={{ color: '#1a1a1a' }}>{suspectNode?.balance || 'N/A'} (≈ {fiatVal.formattedUsd})</strong>
                </div>
                <div>
                  <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>Risk</span>
                  <strong style={{ color: '#1a1a1a' }}>{activeCase.riskScore}%</strong>
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
                      index="··" label="Mixer"
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
                      index="→" label="Receiver"
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
                      <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>Identity</span>
                      <strong style={{ color: '#1a1a1a' }}>{receiverNode.details.kycStatus}</strong>
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
                          {' '}({(endpointProfile.profile.totalReceivedSats / 1e8).toFixed(4)} BTC · {endpointProfile.profile.txCount} txs)
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
                    Cross-chain exits ({crossChainReport.bridgeCount} → {crossChainReport.targetChains.join(', ')})
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
                    Chain of custody · {custodyVerification.valid ? `intact (${custodyVerification.checkedEvents})` : `broken at ${custodyVerification.brokenAtSeq}`}
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
                          <TableCell mono>{shortRef(e.from)} → {shortRef(e.to)}{e.approximateOrder ? ' *' : ''}</TableCell>
                          <TableCell bold>{e.amountBtc.toFixed(4)}</TableCell>
                          <TableCell mono>{e.eventHash.slice(0, 8)}…</TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mono-addr" style={{ fontSize: '0.7rem', color: '#999', marginTop: '0.35rem', wordBreak: 'break-all' }}>
                    {custody.terminalHash}
                    {custody.gaps.length > 0 && ` · ${custody.gaps.map(g => g.note).join(' ')}`}
                  </p>
                </div>
              )}

              {/* Trace Verification & Invariant Audit */}
              {traceAudit && traceAudit.isAudited && (
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <h4 style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1a1a1a', marginBottom: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Trace Verification & Mathematical Assurance</span>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.45rem',
                      borderRadius: '4px',
                      backgroundColor: traceAudit.rating === 'VERIFIED' ? 'rgba(16, 185, 129, 0.12)' : traceAudit.rating === 'SUBSTANTIATED' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      color: traceAudit.rating === 'VERIFIED' ? '#059669' : traceAudit.rating === 'SUBSTANTIATED' ? '#2563eb' : '#dc2626'
                    }}>
                      {traceAudit.rating} · {traceAudit.assuranceScore}% ASSURANCE
                    </span>
                  </h4>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '0.6rem', fontSize: '0.76rem', color: '#334155' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.35rem', marginBottom: '0.4rem' }}>
                      <div>• Value Conservation: <strong>{traceAudit.invariants?.valueConservation?.passed ? 'PASSED (0 leaks)' : 'FAILED'}</strong></div>
                      <div>• Temporal Monotonicity: <strong>{traceAudit.invariants?.temporalCausality?.passed ? 'PASSED (Causal)' : 'FAILED'}</strong></div>
                      <div>• Taint Non-Inflation: <strong>{traceAudit.invariants?.taintConservation?.passed ? 'PASSED (Zero-mint)' : 'FAILED'}</strong></div>
                      <div>• Multi-Model Agreement: <strong>{Math.round((traceAudit.concordance?.score || 0) * 100)}% Concordance</strong></div>
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

              {/* Dynamic Signature */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.5rem', fontSize: '0.82rem', borderTop: '1px solid #e5e5e5', paddingTop: '1rem', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: '55%' }}>
                  <span style={{ color: '#999', display: 'block', fontSize: '0.74rem' }}>Integrity hash</span>
                  <span className="mono-addr" style={{ fontSize: '0.7rem', color: '#333', wordBreak: 'break-all' }}>
                    {integrityHash}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ color: '#999', fontSize: '0.74rem' }}>Signature</span>
                  <div style={{ position: 'relative', border: isLocked ? 'none' : '1px dashed #ddd', borderRadius: '6px', backgroundColor: '#fafafa' }}>
                    <canvas
                      ref={canvasRef}
                      width="180"
                      height="70"
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
                    <p style={{ color: '#999', fontSize: '0.7rem' }}>{officerBadge} · {bureauZone}</p>
                  </div>
                </div>
              </div>
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
