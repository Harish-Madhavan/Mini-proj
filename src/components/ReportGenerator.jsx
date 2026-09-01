import React, { useRef, useState, useEffect } from 'react';
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
  Stamp 
} from 'lucide-react';
import { useCase } from '../hooks/useCase';
import { useToast } from '../hooks/useToast';
import { ZONAL_UNITS, WATERMARK_OPTIONS } from '../constants/legalConstants';
import { convertBtcToFiat } from '../utils/forensicUtils';
import { downloadText } from '../utils/download';
import { calculateTaintMap, formatTaintPct } from '../utils/taintAnalysis';

export default function ReportGenerator() {
  const { activeCase } = useCase();
  const { showToast } = useToast();

  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [integrityHash, setIntegrityHash] = useState('');
  const [officerName, setOfficerName] = useState('Inspector R. Sharma');
  const [officerBadge, setOfficerBadge] = useState('NCB-84920-LE');
  const [bureauZone, setBureauZone] = useState('NCB Head Office, New Delhi');
  const [watermark, setWatermark] = useState(WATERMARK_OPTIONS[0].value);
  const [investigatorNotes, setInvestigatorNotes] = useState(
    'Transaction graph exhibits structured peeling chain hops terminating in an FIU-registered domestic crypto exchange. Section 67 NDPS notice issuance approved.'
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
        // fall back to pseudo hash below
      }
      // Fallback deterministic pseudo-hash for non-secure contexts / tests
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
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
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
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    showToast("Cleared signature pad.", "info");
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || isLocked) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        showToast("Signature/Stamp image loaded.", "success");
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePrint = () => {
    showToast("Opening print dialog for PDF export...", "info");
    window.print();
  };

  const handleExportMarkdown = () => {
    const notesList = activeCase.notesList || [];
    const md = `# NARCOTICS CONTROL BUREAU (NCB) — FORENSIC REPORT
**Issuing Zonal Unit:** ${bureauZone}  
**Classification:** ${watermark}  
**Case Title:** ${activeCase.title}  
**Case Ref:** ${getRefCode()}-${activeCase.id.toUpperCase()}  
**Date:** ${new Date().toISOString().split('T')[0]}  
**Cryptographic Seal:** \`${integrityHash}\`  

---

## 1. Executive Forensic Summary
- **Target Entity:** ${activeCase.suspectName}
- **Blockchain Protocol:** ${activeCase.currency}
- **Traced Seizure Volume:** ${suspectNode?.balance || 'N/A'} (≈ ${fiatVal.formattedUsd} / ${fiatVal.formattedInr})
- **Threat Level Index:** ${activeCase.riskScore}%

## 2. On-Chain Transaction Pathing
${activeCase.links.map((link, i) => `${i + 1}. \`${link.source}\` ➔ \`${link.target}\` | **${link.value}** (${link.timestamp || 'On-chain'})`).join('\n')}

## 3. End Receiver Technical Attribution
- **Target Endpoint Entity:** ${receiverNode?.entityName || 'Unresolved'}
- **Deposit Address:** \`${receiverNode?.details?.address || 'N/A'}\`
- **KYC Status:** ${receiverNode?.details?.kycStatus || 'N/A'}
- **Settled Value:** ${receiverNode?.balance || 'N/A'}

## 4. Case Investigator Field Notes Log (${notesList.length} Entries)
${notesList.length > 0 ? notesList.map((n, i) => `${i + 1}. [${new Date(n.timestamp).toLocaleString()}] **${n.author}:** ${n.content}`).join('\n') : '*No specific field notes recorded for this case.*'}

## 5. Investigating Officer Remarks
${investigatorNotes}

---
**Attesting Officer:** ${officerName} [Badge: ${officerBadge}]  
*Narcotics Control Bureau, Ministry of Home Affairs, Government of India*
`;

    downloadText(md, `NCB-Forensic-Report-${activeCase.id.toUpperCase()}.md`);
    showToast("Downloaded Forensic Report Markdown document.", "success");
  };

  const toggleLock = () => {
    const nextLocked = !isLocked;
    setIsLocked(nextLocked);
    showToast(nextLocked ? "Report integrity seal locked." : "Report form unlocked for editing.", nextLocked ? "success" : "info");
  };

  const getRefCode = () => {
    if (bureauZone.includes('Head Office')) return 'NCB/HQ/ND';
    if (bureauZone.includes('Mumbai')) return 'NCB/MZU/MUM';
    if (bureauZone.includes('Bengaluru')) return 'NCB/BZU/BLR';
    return 'NCB/CIU/CH';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.5fr', gap: '1.5rem' }}>
      
      {/* Report Sheet */}
      <div className="glass-panel" id="printable-area" style={{ position: 'relative', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', backgroundColor: '#ffffff', color: '#0f172a', borderRadius: '8px', overflow: 'hidden' }}>
        
        {/* Subtle Watermark on Printable Area */}
        <div className="report-watermark">
          {watermark}
        </div>

        {/* Report Header */}
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

        {/* Forensic Metadata summary */}
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

        {/* Transaction Flow Details */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <GitBranch size={16} /> ON-CHAIN TRANSACTION HOPS INDEX
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Suspect Node */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', backgroundColor: '#f8fafc', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
              <span style={{ padding: '0.15rem 0.4rem', borderRadius: '3px', backgroundColor: '#fca5a5', color: '#991b1b', fontWeight: 700 }}>Origin Input</span>
              <span style={{ fontFamily: 'monospace', flex: 1 }}>{suspectNode?.details.address}</span>
              <strong style={{ color: '#0f172a' }}>{suspectNode?.balance}</strong>
            </div>

            {/* Mixer */}
            {mixer && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', backgroundColor: '#f8fafc', padding: '0.5rem', borderRadius: '4px', border: '1px dashed #e2e8f0' }}>
                <span style={{ padding: '0.15rem 0.4rem', borderRadius: '3px', backgroundColor: '#ddd6fe', color: '#5b21b6', fontWeight: 700 }}>Mixer Script</span>
                <span style={{ fontFamily: 'monospace', flex: 1 }}>{mixer.details.address}</span>
                <strong style={{ color: '#0f172a' }}>{mixer.balance}</strong>
              </div>
            )}

            {/* Hops */}
            {hops.map((hop, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', backgroundColor: '#f8fafc', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <span style={{ padding: '0.15rem 0.4rem', borderRadius: '3px', backgroundColor: '#e2e8f0', color: '#475569', fontWeight: 700 }}>Transit Hop #{idx + 1}</span>
                <span style={{ fontFamily: 'monospace', flex: 1 }}>{hop.details.address}</span>
                <strong style={{ color: '#0f172a' }}>{hop.balance}</strong>
              </div>
            ))}

            {/* Receiver Node */}
            {receiverNode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', backgroundColor: '#ecfdf5', padding: '0.5rem', borderRadius: '4px', border: '1px solid #059669' }}>
                <span style={{ padding: '0.15rem 0.4rem', borderRadius: '3px', backgroundColor: '#a7f3d0', color: '#065f46', fontWeight: 700 }}>End Receiver</span>
                <span style={{ fontFamily: 'monospace', flex: 1 }}>{receiverNode.details.address}</span>
                <strong style={{ color: '#065f46' }}>{receiverNode.balance}</strong>
              </div>
            )}
          </div>
        </div>

          {/* Receiver Technical Attribution */}
        {receiverNode && (
          <div style={{ border: '1px solid #10b981', backgroundColor: '#f0fdf4', borderRadius: '6px', padding: '0.85rem', position: 'relative', zIndex: 1 }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#065f46', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <UserCheck size={16} /> END RECEIVER ATTRIBUTION SUMMARY
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Target Endpoint Entity:</span>
                <strong style={{ color: '#0f172a' }}>{receiverNode.entityName}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>On-Chain Script Status:</span>
                <strong style={{ color: '#0f172a' }}>{receiverNode.details.kycStatus}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Address Reference:</span>
                <span style={{ fontFamily: 'monospace', color: '#0f172a' }}>{receiverNode.details.address}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Settled Value:</span>
                <strong style={{ color: '#065f46' }}>{receiverNode.balance}</strong>
              </div>
              {receiverTaint != null && (
                <div>
                  <span style={{ color: '#64748b', display: 'block' }}>Taint from Origin:</span>
                  <strong style={{ color: receiverTaint >= 0.5 ? '#b91c1c' : '#065f46' }}>{formatTaintPct(receiverTaint)} {receiverTaint >= 0.35 ? '· Actionable linkage' : '· Low linkage'}</strong>
                </div>
              )}
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Verification:</span>
                <a href={`https://mempool.space/address/${receiverNode.details.address}`} target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7', fontSize: '0.75rem' }}>mempool.space ↗</a>
              </div>
            </div>
          </div>
        )}

        {/* Case Timeline Chronology Log Table */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <Clock size={15} /> CASE CHRONOLOGY & FORENSIC EVENT LOG
          </h4>
          <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', border: '1px solid #e2e8f0' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', color: '#334155', textAlign: 'left' }}>
                <th style={{ padding: '0.4rem', border: '1px solid #e2e8f0' }}>Stage</th>
                <th style={{ padding: '0.4rem', border: '1px solid #e2e8f0' }}>Action / Evidence Event</th>
                <th style={{ padding: '0.4rem', border: '1px solid #e2e8f0' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '0.4rem', border: '1px solid #e2e8f0', fontWeight: 600 }}>1. Intelligence Input</td>
                <td style={{ padding: '0.4rem', border: '1px solid #e2e8f0' }}>Initial suspect wallet flagged in narcotics investigation.</td>
                <td style={{ padding: '0.4rem', border: '1px solid #e2e8f0', color: '#059669', fontWeight: 600 }}>Verified</td>
              </tr>
              <tr>
                <td style={{ padding: '0.4rem', border: '1px solid #e2e8f0', fontWeight: 600 }}>2. Outspend Tracing</td>
                <td style={{ padding: '0.4rem', border: '1px solid #e2e8f0' }}>Recursive forward tracing through {hops.length} peeling chain transit hops.</td>
                <td style={{ padding: '0.4rem', border: '1px solid #e2e8f0', color: '#059669', fontWeight: 600 }}>Traced</td>
              </tr>
              <tr>
                <td style={{ padding: '0.4rem', border: '1px solid #e2e8f0', fontWeight: 600 }}>3. Terminal Resolution</td>
                <td style={{ padding: '0.4rem', border: '1px solid #e2e8f0' }}>Terminal deposit point identified at {receiverNode?.entityName || 'Exchange Endpoint'}.</td>
                <td style={{ padding: '0.4rem', border: '1px solid #e2e8f0', color: '#0284c7', fontWeight: 600 }}>Subpoena Ready</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Case Field Notes Log */}
        {activeCase.notesList && activeCase.notesList.length > 0 && (
          <div style={{ position: 'relative', zIndex: 1, backgroundColor: '#f8fafc', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.3rem' }}>
              FIELD INVESTIGATOR LOG ENTRIES ({activeCase.notesList.length}):
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

        {/* Officer Remarks Field */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>INVESTIGATING OFFICER REMARKS:</label>
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
            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Evidence Integrity Cryptographic Hash</span>
            <span className="mono-addr" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e293b', wordBreak: 'break-all' }}>
              {integrityHash}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Officer Signature & Official Seal</span>
            
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
                  <label
                    style={{ padding: '0.2rem 0.35rem', background: '#e0f2fe', border: 'none', color: '#0284c7', borderRadius: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    title="Upload Stamp / Signature Image"
                  >
                    <Upload size={12} />
                    <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                  </label>
                  <button 
                    onClick={clearSignature}
                    style={{ padding: '0.2rem 0.35rem', background: '#fee2e2', border: 'none', color: '#ef4444', borderRadius: '3px', cursor: 'pointer' }}
                    title="Clear signature"
                  >
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

      </div>

      {/* Options Panel */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: 'fit-content' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText style={{ color: 'var(--primary)' }} size={18} /> Report Controls
        </h3>

        {/* Watermark selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Stamp size={13} /> Document Watermark
          </label>
          <select
            value={watermark}
            disabled={isLocked}
            onChange={(e) => setWatermark(e.target.value)}
            className="select-field"
            style={{ width: '100%' }}
          >
            {WATERMARK_OPTIONS.map((wo, idx) => (
              <option key={idx} value={wo.value}>{wo.label}</option>
            ))}
          </select>
        </div>

        {/* Bureau selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Award size={13} /> Issuing Zonal Office
          </label>
          <select 
            value={bureauZone}
            disabled={isLocked}
            onChange={(e) => setBureauZone(e.target.value)}
            className="select-field"
            style={{ width: '100%' }}
          >
            {ZONAL_UNITS.map((zu, idx) => (
              <option key={idx} value={zu.value}>{zu.label}</option>
            ))}
          </select>
        </div>

        {/* Officer Badge ID */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Officer Badge ID</label>
          <input
            type="text"
            disabled={isLocked}
            value={officerBadge}
            onChange={(e) => setOfficerBadge(e.target.value)}
            className="input-field"
            style={{ width: '100%' }}
          />
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
          {isLocked ? "Unlock Report Form" : "Lock Integrity Seal"}
        </button>
        
        <button
          onClick={handleExportMarkdown}
          className="btn btn-outline"
          style={{ justifyContent: 'center' }}
        >
          <Download size={14} /> Export Markdown Dossier
        </button>

        <button
          onClick={handlePrint}
          className="btn btn-primary"
          style={{ justifyContent: 'center' }}
        >
          <Printer size={16} /> Print / Save as PDF
        </button>
      </div>

    </div>
  );
}
