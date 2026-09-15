import React, { useState, useMemo } from 'react';
import { 
  ShieldAlert, 
  User, 
  HelpCircle, 
  MapPin, 
  Layers, 
  Cpu, 
  Copy,
  Search,
  FileCode,
  Zap,
  CheckCircle2,
  Eye,
  EyeOff,
  FileEdit,
  Plus,
  Trash2,
  Clock,
  Code2,
  Star,
  ExternalLink,
  Tag,
  BarChart3,
  Timer
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { decodeScriptPubkey } from '../../utils/scriptDecoder';
import { computeNodeCentralityMetrics } from '../../utils/graphAlgorithms';
import { calculateTaintMap, formatTaintPct, taintTier } from '../../utils/taintAnalysis';
import { scanCaseSweeps } from '../../utils/obfuscationForensics';
import { scanCaseStructuring } from '../../utils/structuringAnalysis';
import { tagKnownEntity, getExplorerUrls } from '../../utils/knownEntities';
import { useWatchlist } from '../../hooks/useWatchlist';
import { useEndpointProfile } from '../../hooks/useEndpointProfile';
import { getFeeTier } from '../../utils/traceHeuristics';
import { ENDPOINT_PROFILE_LABELS } from '../../utils/bitcoinApi';

function KVRow({ icon, label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
        {icon}{label}:
      </span>
      <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem', textAlign: 'right' }}>{children}</span>
    </div>
  );
}

export default function MetadataSidebar({ 
  selectedNode, 
  activeCase, 
  isolatedNodeId, 
  onToggleIsolate, 
  onSelectTab, 
  onExpandAddress, 
  onAddNote, 
  onDeleteNote 
}) {
  const { showToast } = useToast();
  const { isWatched, toggle } = useWatchlist();
  const [newNoteText, setNewNoteText] = useState('');
  const [showNotesSection, setShowNotesSection] = useState(false);
  const [showScriptDetails, setShowScriptDetails] = useState(false);
  const [showHeuristics, setShowHeuristics] = useState(false);
  const endpointProfile = useEndpointProfile(
    selectedNode?.details?.address,
    selectedNode?.type === 'receiver'
  );

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!", "success");
  };

  const handleCreateNote = (e) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    if (onAddNote) {
      onAddNote(newNoteText.trim(), "Investigating Officer");
      setNewNoteText('');
    }
  };

  const details = selectedNode?.details || {};
  const isIsolated = isolatedNodeId === selectedNode?.id;
  const notesList = activeCase?.notesList || [];
  const watched = isWatched(details.address);
  const knownTag = tagKnownEntity(details.address);
  const explorer = getExplorerUrls(details.address || selectedNode?.id);
  const feeTier = details.feeRateSatVb ? getFeeTier(details.feeRateSatVb) : null;
  const feeReplaceable = /Replaceable|RBF Enabled/.test(details.rbfStatus || '');

  const taintInfo = useMemo(() => {
    if (!activeCase?.nodes?.length || !activeCase?.links?.length || !selectedNode) return null;
    const map = calculateTaintMap(activeCase.nodes, activeCase.links);
    const val = map.get(selectedNode.id) ?? 0;
    return { value: val, formatted: formatTaintPct(val), tier: taintTier(val) };
  }, [activeCase, selectedNode]);

  // Compute node centrality metrics
  const centralityMetrics = useMemo(() => {
    if (!activeCase?.nodes?.length || !activeCase?.links?.length || !selectedNode) return null;
    const allMetrics = computeNodeCentralityMetrics(activeCase.nodes, activeCase.links);
    return allMetrics[selectedNode.id] || null;
  }, [activeCase, selectedNode]);

  // Typology flags: sweep involvement and structuring-source role for this node
  const typologyFlags = useMemo(() => {
    if (!activeCase?.nodes?.length || !activeCase?.links?.length || !selectedNode) return { sweep: null, structuring: null };
    const sweeps = scanCaseSweeps(activeCase.nodes, activeCase.links);
    const structuring = scanCaseStructuring(activeCase.nodes, activeCase.links);
    return {
      sweep: sweeps.detected ? (sweeps.sweeps.find(s => s.nodeId === selectedNode.id) || null) : null,
      structuring: structuring.detected
        ? (structuring.sources.find(s => s.sourceId === selectedNode.id) || null)
        : null,
    };
  }, [activeCase, selectedNode]);

  // Decode Script template & opcodes
  const scriptAnalysis = useMemo(() => {
    const target = details.address || details.opReturnHex || selectedNode?.id;
    if (!target) return null;
    return decodeScriptPubkey(target);
  }, [details.address, details.opReturnHex, selectedNode]);

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {selectedNode ? (
        <>
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: 700, 
                textTransform: 'uppercase', 
                padding: '0.2rem 0.5rem', 
                borderRadius: '4px',
                backgroundColor: 
                  selectedNode.risk === 'critical' ? 'rgba(239, 68, 68, 0.2)' : 
                  selectedNode.risk === 'high' ? 'rgba(239, 68, 68, 0.1)' : 
                  selectedNode.risk === 'medium' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                color: 
                  selectedNode.risk === 'critical' ? '#ef4444' : 
                  selectedNode.risk === 'high' ? '#f87171' : 
                  selectedNode.risk === 'medium' ? '#fbbf24' : '#34d399'
              }}>
                {selectedNode.risk} risk
              </span>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <button
                  onClick={() => onToggleIsolate && onToggleIsolate(selectedNode.id)}
                  className={`btn ${isIsolated ? 'btn-primary pulse-glow-border' : 'btn-outline'}`}
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                  title={isIsolated ? "Clear Path Isolation" : "Isolate Connected Flow Trail"}
                >
                  {isIsolated ? <EyeOff size={12} /> : <Eye size={12} />}
                  {isIsolated ? "Isolated" : "Isolate Trail"}
                </button>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>{selectedNode.balance}</span>
              </div>
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {selectedNode.type === 'suspect' ? <ShieldAlert style={{ color: '#ef4444' }} /> : selectedNode.type === 'receiver' ? <Layers style={{ color: '#10b981' }} /> : <Cpu />}
              {selectedNode.entityName}
            </h3>
          </div>

          {/* Address / Tx Reference Bar */}
          <div style={{ backgroundColor: 'rgba(5, 8, 16, 0.9)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Address / reference</span>
              <button
                onClick={() => {
                  const result = toggle(details.address);
                  if (result === 'added') showToast('Address added to watchlist.', 'success');
                  else if (result === 'removed') showToast('Address removed.', 'info');
                  else if (result === 'full') showToast('Watchlist is full (100).', 'warning');
                  else showToast('Only Bitcoin addresses can be watched.', 'warning');
                }}
                className="btn"
                aria-pressed={watched}
                aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
                title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
                style={{ padding: '0.15rem 0.35rem', fontSize: '0.7rem', backgroundColor: watched ? 'rgba(245,158,11,0.15)' : undefined, color: watched ? '#f59e0b' : undefined, borderColor: watched ? 'rgba(245,158,11,0.4)' : undefined }}
              >
                <Star size={12} fill={watched ? 'currentColor' : 'none'} aria-hidden="true" /> {watched ? 'Watching' : 'Watch'}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
              <span className="mono-addr" style={{ fontSize: '0.8rem', wordBreak: 'break-all', marginRight: '0.5rem' }}>{details.address}</span>
              <button 
                onClick={() => handleCopy(details.address)}
                aria-label="Copy reference"
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                title="Copy Reference"
              >
                <Copy size={16} aria-hidden="true" />
              </button>
            </div>
            {explorer && (
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                <a href={explorer.mempool} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', textDecoration: 'none' }} aria-label="Open in mempool.space"><ExternalLink size={12} aria-hidden="true" /> mempool.space</a>
                <a href={explorer.blockstream} target="_blank" rel="noopener noreferrer" className="btn" style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', textDecoration: 'none' }} aria-label="Open in Blockstream"><ExternalLink size={12} aria-hidden="true" /> Blockstream</a>
              </div>
            )}
            {knownTag && (
              <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.5rem', borderRadius: '4px', backgroundColor: knownTag.risk === 'high' ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.08)', border: `1px solid ${knownTag.risk === 'high' ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.2)'}`, fontSize: '0.7rem', display: 'flex', gap: '0.3rem', alignItems: 'flex-start' }}>
                <Tag size={12} style={{ marginTop: '0.15rem', color: knownTag.risk === 'high' ? '#ef4444' : 'var(--primary)' }} aria-hidden="true" />
                <div><strong>{knownTag.label}</strong> <span style={{ color: 'var(--text-muted)' }}>· {knownTag.note}</span></div>
              </div>
            )}
          </div>

          {centralityMetrics && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.75rem', padding: '0 0.1rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Flow:</span>
              <strong style={{ color: centralityMetrics.isHub ? '#f59e0b' : '#fff' }}>
                {centralityMetrics.inDegree} in · {centralityMetrics.outDegree} out{centralityMetrics.isHub ? ' · hub' : ''}
              </strong>
            </div>
          )}
          {/* Flow signals */}
          {(typologyFlags.sweep || typologyFlags.structuring || taintInfo || (selectedNode.type === 'receiver' && endpointProfile.status === 'ready' && endpointProfile.profile)) && (
            <div style={{ backgroundColor: 'rgba(5, 8, 16, 0.6)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.75rem' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Signals</span>
              {typologyFlags.sweep && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Sweep</span>
                  <span style={{ fontWeight: 600, color: typologyFlags.sweep.cashoutUrgency === 'IMMINENT' ? '#ef4444' : '#f59e0b' }}>
                    {typologyFlags.sweep.cashoutUrgency === 'IMMINENT' ? 'Likely cash-out' : 'Aggregation'} · {typologyFlags.sweep.inputCount}→1 · {typologyFlags.sweep.consolidatedBtc} BTC
                  </span>
                </div>
              )}
              {typologyFlags.structuring && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Structuring</span>
                  <span style={{ fontWeight: 600, color: '#f59e0b' }}>{typologyFlags.structuring.maxBandSize} similar payments</span>
                </div>
              )}
              {taintInfo && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Taint</span>
                  <span style={{ fontWeight: 600, color: taintInfo.tier.color }}>{taintInfo.formatted}</span>
                </div>
              )}
              {selectedNode.type === 'receiver' && endpointProfile.status === 'ready' && endpointProfile.profile && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Endpoint</span>
                  <span style={{ fontWeight: 600, color: '#fff', textAlign: 'right' }}>
                    {ENDPOINT_PROFILE_LABELS[endpointProfile.profile.profile] || endpointProfile.profile.profile}
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {(endpointProfile.profile.totalReceivedSats / 1e8).toFixed(4)} BTC · {endpointProfile.profile.txCount} txs{endpointProfile.profile.isAggregator ? ' · aggregator' : ''}</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.825rem' }}>
            <KVRow label="Type">
              <span style={{ textTransform: 'capitalize' }}>{selectedNode.type}</span>
            </KVRow>

            {details.scriptStandard && (
              <KVRow icon={<FileCode size={13} style={{ color: 'var(--primary)' }} />} label="Address type">
                <span style={{ color: 'var(--primary)' }}>{details.scriptStandard}</span>
              </KVRow>
            )}

            {details.feeRateSatVb && (
              <KVRow icon={<Zap size={13} style={{ color: '#f59e0b' }} />} label="Fee">
                <>{details.feeRateSatVb}{details.vsize ? ` · ${details.vsize}` : ''}{feeReplaceable ? ' · can be replaced' : ''} {feeTier && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', borderRadius: '3px', backgroundColor: `${feeTier.color}18`, color: feeTier.color }}>{feeTier.label}</span>}</>
              </KVRow>
            )}
            {details.blockHeight != null && (
              <KVRow icon={<Timer size={12} />} label="Block">
                <span style={{ fontFamily: 'monospace' }}>Block {details.blockHeight}</span>
              </KVRow>
            )}

            {details.confirmations && (
              <KVRow icon={<CheckCircle2 size={13} style={{ color: '#10b981' }} />} label="Status">
                {details.confirmations}
              </KVRow>
            )}

            <KVRow label="Last seen:">{details.lastActive}</KVRow>
            <KVRow icon={<MapPin size={12} style={{ color: '#ef4444' }} />} label="Network">
              {details.ipLog}
            </KVRow>
            <KVRow label="Identity check">
              <span style={{ color: selectedNode.type === 'receiver' ? '#10b981' : 'var(--text-muted)' }}>
                {details.kycStatus}
              </span>
            </KVRow>

            {/* Script details panel */}
            {scriptAnalysis && (
              <div style={{ marginTop: '0.5rem', backgroundColor: 'rgba(5, 8, 16, 0.8)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Code2 size={13} /> Script details
                  </span>
                  <button
                    onClick={() => setShowScriptDetails(!showScriptDetails)}
                    className="btn btn-outline"
                    style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}
                  >
                    {showScriptDetails ? "Hide" : "Inspect"}
                  </button>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 600 }}>{scriptAnalysis.type}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>Standard: {scriptAnalysis.standard}</div>

                {showScriptDetails && (
                  <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.7rem' }}>
                    <div style={{ color: '#cbd5e1' }}><strong>Code:</strong> <code style={{ color: 'var(--primary)' }}>{scriptAnalysis.asm}</code></div>
                    <div style={{ color: 'var(--text-muted)' }}>Rating: {scriptAnalysis.securityRating}</div>
                    <div style={{ color: 'var(--text-muted)' }}>To spend: {scriptAnalysis.spendRequirement}</div>
                  </div>
                )}
              </div>
            )}

            {/* Heuristic Breakdown — weighted change vs payment */}
            {details.heuristicBreakdown && (
              <div style={{ marginTop: '0.5rem', backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)', borderRadius: '6px', padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><BarChart3 size={13} /> Score: {details.heuristicScore != null ? `${details.heuristicScore > 0 ? '+' : ''}${details.heuristicScore}` : '—'} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({(details.heuristicConfidence*100).toFixed(0)}%)</span></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '3px', backgroundColor: details.heuristicScore > 1 ? 'rgba(16,185,129,0.15)' : details.heuristicScore < -1 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)', color: details.heuristicScore > 1 ? '#10b981' : details.heuristicScore < -1 ? '#ef4444' : 'var(--text-muted)' }}>{details.heuristicScore > 1 ? 'Payment' : details.heuristicScore < -1 ? 'Change' : 'Ambiguous'}</span>
                    <button
                      onClick={() => setShowHeuristics(!showHeuristics)}
                      className="btn btn-outline"
                      type="button"
                      aria-expanded={showHeuristics}
                      style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}
                    >
                      {showHeuristics ? "Hide" : "Why"}
                    </button>
                  </span>
                </div>
                {showHeuristics && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.4rem' }}>
                      {[
                        ['Address type', details.heuristicBreakdown.scriptScore],
                        ['Reuse', details.heuristicBreakdown.reuseScore],
                        ['Round amount', details.heuristicBreakdown.roundnessScore],
                        ['Position', details.heuristicBreakdown.positionScore],
                        ['Spent', details.heuristicBreakdown.spentScore],
                        ...(details.heuristicBreakdown.fingerprintScore != null ? [['Pattern', details.heuristicBreakdown.fingerprintScore]] : []),
                        ...(details.heuristicBreakdown.feeScore != null ? [['Fee', details.heuristicBreakdown.feeScore]] : []),
                    ...(details.heuristicBreakdown.identityScore ? [['Identity', details.heuristicBreakdown.identityScore]] : []),
                    ...(details.heuristicBreakdown.chainReuseScore ? [['Chain use', details.heuristicBreakdown.chainReuseScore]] : []),
                  ].map(([label, val]) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem' }}>
                          <span style={{ width: '70px', color: 'var(--text-muted)' }}>{label}</span>
                          <div style={{ flex: 1, height: '6px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, Math.abs(val)*20)}%`, marginLeft: val < 0 ? 'auto' : undefined, height: '100%', backgroundColor: val > 0 ? '#10b981' : val < 0 ? '#ef4444' : 'var(--text-muted)' }} />
                          </div>
                          <span style={{ width: '36px', textAlign: 'right', color: val > 0 ? '#10b981' : val < 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: 600 }}>{val > 0 ? `+${val}` : val}</span>
                        </div>
                      ))}
                    </div>
                    {details.heuristicBreakdown.dwellBlocks != null && (
                      <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Spent {details.heuristicBreakdown.dwellBlocks} blocks after the parent</div>
                    )}
                    {details.exchangeConf != null && (
                      <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Exchange likelihood: <strong style={{ color: details.exchangeConf > 0.4 ? '#f59e0b' : 'var(--text-secondary)' }}>{(details.exchangeConf*100).toFixed(0)}%</strong></div>
                    )}
                  </>
                )}
              </div>
            )}
            {/* OP_RETURN Decoded Payload Banner */}
            {details.opReturnHex && (
              <div style={{ marginTop: '0.5rem', backgroundColor: 'rgba(168, 85, 247, 0.08)', border: '1px solid #a855f7', borderRadius: '6px', padding: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                  Embedded message
                </span>
                {details.opReturnDecoded && (
                  <div style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 600, marginBottom: '0.3rem' }}>
                    "{details.opReturnDecoded}"
                  </div>
                )}
                <div className="mono-addr" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  Raw code: {details.opReturnHex}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem' }}>
              <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><ShieldAlert size={12} /> Why flagged:</span>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: '1.4' }}>{details.riskReason}</p>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <FileEdit size={13} style={{ color: 'var(--primary)' }} /> Notes ({notesList.length})
              </span>
              <button
                onClick={() => setShowNotesSection(!showNotesSection)}
                className="btn btn-outline"
                style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}
              >
                {showNotesSection ? "Collapse" : "Open Log"}
              </button>
            </div>

            {showNotesSection && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <form onSubmit={handleCreateNote} style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="text"
                    placeholder={`Note on ${selectedNode.label}...`}
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    className="input-field"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
                  />
                  <button type="submit" className="btn btn-primary" style={{ padding: '0.35rem 0.6rem' }} title="Add Field Note">
                    <Plus size={13} />
                  </button>
                </form>

                <div style={{ maxHeight: '130px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {notesList.length === 0 ? (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No notes logged yet.</span>
                  ) : (
                    notesList.map((note) => (
                      <div key={note.id} style={{ backgroundColor: 'rgba(5, 8, 16, 0.8)', padding: '0.45rem', borderRadius: '5px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '0.75rem' }}>
                        <div>
                          <p style={{ color: '#fff', margin: 0 }}>{note.content}</p>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.2rem' }}>
                            <Clock size={10} /> {new Date(note.timestamp).toLocaleTimeString()} • {note.author}
                          </span>
                        </div>
                        {onDeleteNote && (
                          <button onClick={() => onDeleteNote(note.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.1rem' }}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Expand and notice options */}
          {selectedNode.type === 'receiver' ? (
            <div className="pulse-glow-border" style={{ 
              backgroundColor: 'rgba(16, 185, 129, 0.05)', 
              border: '1px solid #10b981', 
              borderRadius: '8px', 
              padding: '0.75rem' 
            }}>
              <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <User size={12} /> Identity record available
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.25rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
                <div>Name: <strong style={{ color: '#fff' }}>{details.ownerName || 'Identified Gateway'}</strong></div>
                <div>ID Document: <strong style={{ color: '#fff' }}>{details.kycDocumentId || 'SUBPOENA READY'}</strong></div>
              </div>
              <button
                onClick={() => onSelectTab('osint')}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  marginTop: '0.75rem',
                  padding: '0.4rem',
                  justifyContent: 'center',
                  fontSize: '0.8rem'
                }}
              >
                Prepare notice
              </button>
            </div>
          ) : !selectedNode.id.startsWith('tx_') && onExpandAddress ? (
            <button
              onClick={() => onExpandAddress(details.address)}
              className="btn btn-outline"
              style={{
                width: '100%',
                marginTop: 'auto',
                padding: '0.6rem',
                justifyContent: 'center',
                fontSize: '0.85rem'
              }}
            >
              <Search size={14} /> Trace forward
            </button>
          ) : null}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
          <HelpCircle size={40} />
          <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>Select a node to inspect it.</p>
        </div>
      )}
    </div>
  );
}
