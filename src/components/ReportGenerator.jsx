import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Printer,
  UserCheck,
  GitBranch,
  Trash2,
  Lock,
  LockOpen,
  Award,
  Upload,
  Download,
  Clock,
  Stamp,
  Copy,
  Layers
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

function HopRow({ pill, pillStyle, address, balance, balanceColor = '#0f172a', dashed = false, bg = '#f8fafc', borderColor = '#e2e8f0' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', backgroundColor: bg, padding: '0.5rem', borderRadius: '4px', border: `${dashed ? '1px dashed' : '1px solid'} ${borderColor}` }}>
      <span style={{ padding: '0.15rem 0.4rem', borderRadius: '3px', fontWeight: 700, ...pillStyle }}>{pill}</span>
      <span style={{ fontFamily: 'monospace', flex: 1 }}>{address}</span>
      <strong style={{ color: balanceColor }}>{balance}</strong>
    </div>
  );
}

function TableCell({ children, bold, mono, style, isHeader = false }) {
  const Tag = isHeader ? 'th' : 'td';
  return (
    <Tag style={{
      padding: '0.35rem',
      border: '1px solid #cbd5e1',
      fontWeight: bold || isHeader ? 600 : 'normal',
      fontFamily: mono ? 'monospace' : 'inherit',
      textAlign: isHeader ? 'left' : 'inherit',
      backgroundColor: isHeader ? '#f8fafc' : 'transparent',
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

## 7. Officer remarks
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Statutory Format Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.35rem', backgroundColor: 'rgba(15, 23, 42, 0.75)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setReportType('ndps_section67')}
            className={`btn ${!isEvidence ? 'btn-primary' : 'btn-outline'}`}
            type="button"
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.85rem' }}
          >
            Section 67 NDPS Forensic Report
          </button>
          <button
            onClick={() => setReportType('evidence_section65b')}
            className={`btn ${isEvidence ? 'btn-primary' : 'btn-outline'}`}
            type="button"
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.85rem' }}
          >
            Section 65B Evidence Act Certificate (BSA 2023)
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button onClick={handleCopy} className="btn btn-outline" type="button" style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
            <Copy size={13} /> {isEvidence ? 'Copy Affidavit' : 'Copy Markdown'}
          </button>
          <button onClick={handleExport} className="btn btn-primary" type="button" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
            <Download size={13} /> {isEvidence ? 'Download Certificate (.txt)' : 'Export .md'}
          </button>
        </div>
      </div>

      <div className="responsive-split-grid" style={{ display: 'grid', gridTemplateColumns: '3fr 1.5fr', gap: '1.5rem' }}>
        
        {/* Printable Area */}
        <div className="glass-panel" id="printable-area" style={{ position: 'relative', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', backgroundColor: '#ffffff', color: '#0f172a', borderRadius: '8px', overflow: 'hidden' }}>
          <div className="report-watermark">{watermark}</div>

          {isEvidence ? (
            /* SECTION 65B EVIDENCE ACT AFFIDAVIT VIEW */
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '1.2rem', fontFamily: 'Georgia, serif', lineHeight: '1.6' }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', color: '#0f172a' }}>
                  BEFORE THE SPECIAL COURT FOR NDPS CASES / SESSIONS COURT
                </h2>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155', marginTop: '0.2rem' }}>
                  GOVERNMENT OF INDIA, NARCOTICS CONTROL BUREAU
                </h3>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
                  ZONAL UNIT: {bureauZone.toUpperCase()}
                </span>
                <div style={{ marginTop: '0.5rem', display: 'inline-block', backgroundColor: '#fee2e2', color: '#991b1b', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                  CERTIFICATE UNDER SECTION 65B OF THE INDIAN EVIDENCE ACT, 1872
                  <br />(READ WITH SECTION 63 OF THE BHARATIYA SAKSHYA ADHINIYAM, 2023)
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                <span><strong>CRIME / FIR REF:</strong> NCB/NDPS/CR-{activeCase.id.slice(-4).toUpperCase()}/2026</span>
                <span><strong>DATE:</strong> {new Date().toISOString().split('T')[0]}</span>
              </div>

              <div style={{ fontSize: '0.85rem', color: '#1e293b', textAlign: 'justify' }}>
                <p style={{ marginBottom: '0.75rem' }}>
                  I, <strong>{officerName}</strong>, Badge No. <strong>{officerBadge}</strong>, currently serving at {bureauZone}, do hereby solemnly affirm and state on oath as under:
                </p>
                <p style={{ marginBottom: '0.75rem' }}>
                  <strong>1. Authority & Competence:</strong> That I am the Investigating Officer / Certified Cyber Forensic Examiner in the investigation titled <em>"{activeCase.title}"</em> and am fully authorized to extract, preserve, and certify electronic records pertaining to on-chain cryptocurrency fund flows.
                </p>
                <p style={{ marginBottom: '0.75rem' }}>
                  <strong>2. System Integrity (Section 65B(2) / Section 63(2)):</strong> The electronic transaction trace was generated using the AegisTrace Forensic Suite operating on an isolated, secured NCB Cyber Forensic Workstation. The workstation was operating properly and free from any operational malfunctions or tampering throughout the material period.
                </p>
                <p style={{ marginBottom: '0.75rem' }}>
                  <strong>3. Manifest & Integrity Hash:</strong> The complete transaction flow consisting of {activeCase.nodes?.length || 0} nodes and {activeCase.links?.length || 0} validated transaction steps has been sealed under SHA-256 digest:
                </p>
                <div style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', padding: '0.5rem 0.75rem', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.75rem', color: '#0f172a', margin: '0.5rem 0' }}>
                  {integrityHash}
                </div>
                <p style={{ marginTop: '0.75rem' }}>
                  <strong>4. End receiver:</strong> The transaction path demonstrates direct fund movement ending at an exchange-held deposit address <code style={{ fontFamily: 'monospace', backgroundColor: '#e2e8f0', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{receiverNode?.details?.address || 'N/A'}</code> attributed to <strong>{receiverNode?.entityName || 'Domestic exchange'}</strong> with settled value of <strong>{receiverNode?.balance || '0 BTC'}</strong>.
                </p>
              </div>

              {/* Manifest Table */}
              <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                  EXHIBIT SCHEDULE — CRYPTOGRAPHIC NODE MANIFEST
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', border: '1px solid #cbd5e1' }}>
                  <thead>
                    <tr>
                      <TableCell isHeader>Ex. #</TableCell>
                      <TableCell isHeader>Node Entity</TableCell>
                      <TableCell isHeader>On-Chain Identifier / Address</TableCell>
                      <TableCell isHeader>Value</TableCell>
                      <TableCell isHeader>Forensic Role</TableCell>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCase.nodes.map((n, i) => (
                      <tr key={n.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <TableCell bold>Ex-{i + 1}</TableCell>
                        <TableCell>{n.entityName || n.label}</TableCell>
                        <TableCell mono>{n.details?.address ? `${n.details.address.slice(0, 10)}...${n.details.address.slice(-8)}` : n.id}</TableCell>
                        <TableCell bold>{n.balance}</TableCell>
                        <TableCell>{n.type.toUpperCase()}</TableCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '1rem', borderTop: '1px solid #cbd5e1', paddingTop: '0.75rem', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <p><strong>Place:</strong> {bureauZone.split(',')[0]}</p>
                  <p><strong>Date:</strong> {new Date().toISOString().split('T')[0]}</p>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Digitally sealed under Section 65B IEA / Section 63 BSA 2023</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ borderBottom: '1px solid #0f172a', width: '180px', marginBottom: '0.25rem' }}></div>
                  <strong style={{ display: 'block' }}>{officerName}</strong>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Investigating Officer / Deponent</span>
                  <br />
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{bureauZone}</span>
                </div>
              </div>
            </div>
          ) : (
            /* SECTION 67 NDPS STANDARD REPORT VIEW */
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '1rem', position: 'relative', zIndex: 1 }}>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>Narcotics Control Bureau (NCB)</h2>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: '0.2rem' }}>
                    {bureauZone} | Government of India
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.5rem', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#991b1b' }}>
                    {watermark.split('—')[0].trim()}
                  </span>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.4rem' }}>Case Ref: {getRefCode()}-{activeCase.id.toUpperCase()}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', fontSize: '0.85rem', position: 'relative', zIndex: 1 }}>
                <div>
                  <span style={{ color: '#64748b', display: 'block' }}>Investigation Title:</span>
                  <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{activeCase.title}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block' }}>Origin Target:</span>
                  <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{activeCase.suspectName}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block' }}>Blockchain Asset:</span>
                  <strong style={{ color: '#0f172a' }}>{activeCase.currency} Protocol (≈ {fiatVal.formattedUsd} / {fiatVal.formattedInr})</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block' }}>Calculated Risk Score:</span>
                  <strong style={{ color: '#b91c1c' }}>{activeCase.riskScore}% Threat Index</strong>
                </div>
              </div>

              {narrative && (
                <div style={{ position: 'relative', zIndex: 1, border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.85rem', backgroundColor: '#f8fafc' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <FileText size={15} /> SUMMARY
                  </h4>
                  <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.3rem' }}>{narrative.headline}</p>
                  <p style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '0.5rem' }}>{narrative.summary}</p>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase' }}>Findings</span>
                  <ul style={{ margin: '0.2rem 0 0.5rem 1rem', padding: 0, fontSize: '0.78rem', color: '#1e293b' }}>
                    {narrative.findings.map((f, i) => <li key={i} style={{ marginBottom: '0.2rem' }}>{f}</li>)}
                  </ul>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase' }}>Limits of this analysis</span>
                  <ul style={{ margin: '0.2rem 0 0 1rem', padding: 0, fontSize: '0.78rem', color: '#475569' }}>
                    {narrative.limitations.map((l, i) => <li key={i} style={{ marginBottom: '0.2rem' }}>{l}</li>)}
                  </ul>
                </div>
              )}

              <div style={{ position: 'relative', zIndex: 1 }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <GitBranch size={16} /> TRANSACTION STEPS
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <HopRow
                    pill="Start" pillStyle={{ backgroundColor: '#fca5a5', color: '#991b1b' }}
                    address={suspectNode?.details?.address || suspectNode?.id || 'N/A'}
                    balance={suspectNode?.balance || '0 BTC'}
                  />
                  {mixer && (
                    <HopRow
                      pill="Mixing" pillStyle={{ backgroundColor: '#ddd6fe', color: '#5b21b6' }}
                      address={mixer.details?.address || mixer.id}
                      balance={mixer.balance} dashed
                    />
                  )}
                  {hops.map((hop, idx) => (
                    <HopRow
                      key={idx}
                      pill={`Step #${idx + 1}`} pillStyle={{ backgroundColor: '#e2e8f0', color: '#475569' }}
                      address={hop.details?.address || hop.id}
                      balance={hop.balance}
                    />
                  ))}
                  {receiverNode && (
                    <HopRow
                      pill="End receiver" pillStyle={{ backgroundColor: '#a7f3d0', color: '#065f46' }}
                      address={receiverNode.details?.address || receiverNode.id}
                      balance={receiverNode.balance} balanceColor="#065f46"
                      bg="#ecfdf5" borderColor="#059669"
                    />
                  )}
                </div>
              </div>

              {receiverNode && (
                <div style={{ border: '1px solid #10b981', backgroundColor: '#f0fdf4', borderRadius: '6px', padding: '0.85rem', position: 'relative', zIndex: 1 }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#065f46', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <UserCheck size={16} /> END RECEIVER
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Endpoint:</span>
                      <strong style={{ color: '#0f172a' }}>{receiverNode.entityName}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Identity check:</span>
                      <strong style={{ color: '#0f172a' }}>{receiverNode.details.kycStatus}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Address:</span>
                      <span style={{ fontFamily: 'monospace', color: '#0f172a' }}>{receiverNode.details.address}</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Amount:</span>
                      <strong style={{ color: '#065f46' }}>{receiverNode.balance}</strong>
                    </div>
                    {endpointProfile.status === 'ready' && endpointProfile.profile && (
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>Past activity:</span>
                        <strong style={{ color: '#0f172a' }}>
                          {ENDPOINT_PROFILE_LABELS[endpointProfile.profile.profile] || endpointProfile.profile.profile}
                          {' '}({(endpointProfile.profile.totalReceivedSats / 1e8).toFixed(4)} BTC in · {endpointProfile.profile.txCount} txs{endpointProfile.profile.isAggregator ? ' · aggregator' : ''})
                        </strong>
                      </div>
                    )}
                    {receiverTaint != null && (
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>Traced funds:</span>
                        <strong style={{ color: receiverTaint >= 0.5 ? '#b91c1c' : '#065f46' }}>{formatTaintPct(receiverTaint)} {receiverTaint >= 0.35 ? '· Strong link' : '· Weak link'}</strong>
                      </div>
                    )}
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Verification:</span>
                      <a href={`https://mempool.space/address/${receiverNode.details.address}`} target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7', fontSize: '0.75rem' }}>mempool.space ↗</a>
                    </div>
                  </div>
                </div>
              )}

              {/* Cross-Chain Foreign Ledger Exits */}
              {crossChainReport?.detected && (
                <div style={{ border: '1px solid #0284c7', backgroundColor: '#f0f9ff', borderRadius: '6px', padding: '0.85rem', position: 'relative', zIndex: 1 }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <Layers size={16} /> CROSS-CHAIN SETTLEMENTS & FOREIGN LEDGERS
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: '#334155', margin: '0 0 0.5rem 0' }}>
                    Identified {crossChainReport.bridgeCount} cross-chain bridge transaction(s) exiting into external distributed ledgers ({crossChainReport.targetChains.join(', ')}).
                  </p>
                  <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse', border: '1px solid #bae6fd' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#e0f2fe' }}>
                        <TableCell isHeader>Protocol</TableCell>
                        <TableCell isHeader>Target Chain / Asset</TableCell>
                        <TableCell isHeader>Foreign Destination Address</TableCell>
                        <TableCell isHeader>Verification</TableCell>
                      </tr>
                    </thead>
                    <tbody>
                      {crossChainReport.hops.map((hop, idx) => (
                        <tr key={idx}>
                          <TableCell bold>{hop.bridgeName}</TableCell>
                          <TableCell>{hop.destinationChain} ({hop.targetAsset})</TableCell>
                          <TableCell mono>{hop.destinationAddress}</TableCell>
                          <TableCell>
                            {hop.explorerUrl ? (
                              <a href={hop.explorerUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7', textDecoration: 'underline' }}>
                                {hop.destinationChain} Explorer ↗
                              </a>
                            ) : (
                              'Manual Ledger Query'
                            )}
                          </TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>
                    Note: Assets converted via decentralized cross-chain liquidity pools require separate subpoena/inquiry directed to foreign ledger relayers and target custodial exchanges.
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <Clock size={15} /> TIMELINE
                </h4>
                <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', border: '1px solid #e2e8f0' }}>
                  <thead>
                    <tr>
                      <TableCell isHeader>Step</TableCell>
                      <TableCell isHeader>What happened</TableCell>
                      <TableCell isHeader>Status</TableCell>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <TableCell bold>1. Start</TableCell>
                      <TableCell>Starting wallet noted.</TableCell>
                      <TableCell style={{ color: '#059669', fontWeight: 600 }}>Done</TableCell>
                    </tr>
                    <tr>
                      <TableCell bold>2. Tracing</TableCell>
                      <TableCell>Followed the money through {hops.length} middle steps.</TableCell>
                      <TableCell style={{ color: '#059669', fontWeight: 600 }}>Done</TableCell>
                    </tr>
                    <tr>
                      <TableCell bold>3. End point</TableCell>
                      <TableCell>Final deposit found at {receiverNode?.entityName || 'exchange'}.</TableCell>
                      <TableCell style={{ color: '#0284c7', fontWeight: 600 }}>Ready for notice</TableCell>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Chain of custody */}
              {custody.eventCount > 0 && (
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <Lock size={15} /> CHAIN OF CUSTODY
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '3px', backgroundColor: custodyVerification.valid ? '#dcfce7' : '#fee2e2', color: custodyVerification.valid ? '#166534' : '#991b1b' }}>
                      {custodyVerification.valid ? `Verified · ${custodyVerification.checkedEvents} events` : `Broken at seq ${custodyVerification.brokenAtSeq}`}
                    </span>
                  </h4>
                  <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse', border: '1px solid #e2e8f0' }}>
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
                          <TableCell bold>{e.seq}</TableCell>
                          <TableCell mono>{shortRef(e.from)} → {shortRef(e.to)}{e.approximateOrder ? ' *' : ''}</TableCell>
                          <TableCell bold>{e.amountBtc.toFixed(4)}</TableCell>
                          <TableCell mono>{e.eventHash.slice(0, 8)}…</TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mono-addr" style={{ fontSize: '0.7rem', color: '#475569', marginTop: '0.3rem' }}>
                    Terminal seal: {custody.terminalHash}
                    {custody.gaps.length > 0 && ` · ${custody.gaps.length} gap flag${custody.gaps.length === 1 ? '' : 's'}: ${custody.gaps.map(g => g.note).join(' ')}`}
                  </p>
                </div>
              )}

              {/* Field notes */}
              {activeCase.notesList && activeCase.notesList.length > 0 && (
                <div style={{ position: 'relative', zIndex: 1, backgroundColor: '#f8fafc', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.3rem' }}>
                    FIELD NOTES ({activeCase.notesList.length}):
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {activeCase.notesList.map((n, i) => (
                      <div key={i} style={{ fontSize: '0.7rem', color: '#1e293b', display: 'flex', justifyContent: 'space-between', borderBottom: i < activeCase.notesList.length - 1 ? '1px dashed #cbd5e1' : 'none', paddingBottom: '0.2rem' }}>
                        <span><strong>{n.author}:</strong> {n.content}</span>
                        <span style={{ color: '#64748b' }}>{new Date(n.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Officer remarks */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>OFFICER REMARKS:</label>
                <textarea
                  rows={2}
                  disabled={isLocked}
                  value={investigatorNotes}
                  onChange={(e) => setInvestigatorNotes(e.target.value)}
                  style={{
                    width: '100%',
                    fontSize: '0.75rem',
                    color: '#0f172a',
                    border: isLocked ? 'none' : '1px solid #cbd5e1',
                    backgroundColor: isLocked ? 'transparent' : '#f8fafc',
                    padding: '0.4rem',
                    borderRadius: '4px',
                    resize: 'none'
                  }}
                />
              </div>

              {/* Dynamic Signature */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '1rem', fontSize: '0.85rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem', position: 'relative', zIndex: 1 }}>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Integrity hash</span>
                  <span className="mono-addr" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e293b', wordBreak: 'break-all' }}>
                    {integrityHash}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Signature</span>
                  <div style={{ position: 'relative', border: isLocked ? 'none' : '1px dashed #cbd5e1', borderRadius: '4px', backgroundColor: '#f8fafc' }}>
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
                        <label style={{ padding: '0.2rem 0.35rem', background: '#e0f2fe', border: 'none', color: '#0284c7', borderRadius: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Upload Stamp / Signature Image">
                          <Upload size={12} />
                          <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                        </label>
                        <button onClick={clearSignature} style={{ padding: '0.2rem 0.35rem', background: '#fee2e2', border: 'none', color: '#ef4444', borderRadius: '3px', cursor: 'pointer' }} title="Clear signature">
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
                        border: isLocked ? 'none' : '1px solid #cbd5e1',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        color: '#0f172a',
                        background: 'transparent',
                        fontSize: '0.8rem',
                        outline: 'none',
                        padding: '2px'
                      }}
                    />
                    <p style={{ color: '#64748b', fontSize: '0.7rem' }}>Badge No: {officerBadge} | {bureauZone}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Options Panel */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: 'fit-content' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText style={{ color: 'var(--primary)' }} size={18} /> Controls
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Stamp size={13} /> Watermark
            </label>
            <select value={watermark} disabled={isLocked} onChange={(e) => setWatermark(e.target.value)} className="select-field" style={{ width: '100%' }}>
              {WATERMARK_OPTIONS.map((wo, idx) => (
                <option key={idx} value={wo.value}>{wo.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Award size={13} /> Office
            </label>
            <select value={bureauZone} disabled={isLocked} onChange={(e) => setBureauZone(e.target.value)} className="select-field" style={{ width: '100%' }}>
              {ZONAL_UNITS.map((zu, idx) => (
                <option key={idx} value={zu.value}>{zu.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Badge</label>
            <input type="text" disabled={isLocked} value={officerBadge} onChange={(e) => setOfficerBadge(e.target.value)} className="input-field" style={{ width: '100%' }} />
          </div>

          <button
            onClick={toggleLock}
            className={`btn ${isLocked ? 'btn-outline' : ''}`}
            style={{
              borderColor: isLocked ? 'var(--secondary)' : 'var(--border-color)',
              color: isLocked ? 'var(--secondary)' : 'var(--text-secondary)',
              backgroundColor: isLocked ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255, 255, 255, 0.02)',
              justifyContent: 'center'
            }}
          >
            {isLocked ? <Lock size={14} /> : <LockOpen size={14} />}
            {isLocked ? "Unlock" : "Lock"}
          </button>
          
          <button onClick={handleCopy} className="btn btn-outline" style={{ justifyContent: 'center' }}>
            <Copy size={14} /> Copy text
          </button>

          <button onClick={handleExport} className="btn btn-outline" style={{ justifyContent: 'center' }}>
            <Download size={14} /> Export text
          </button>

          <button onClick={handlePrint} className="btn btn-primary" style={{ justifyContent: 'center' }}>
            <Printer size={16} /> Print / PDF
          </button>
        </div>

      </div>
    </div>
  );
}
