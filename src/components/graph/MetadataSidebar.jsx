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
  Droplets,
  Tag,
  BarChart3,
  Timer
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { decodeScriptPubkey } from '../../utils/scriptDecoder';
import { computeNodeCentralityMetrics } from '../../utils/graphAlgorithms';
import { calculateTaintMap, formatTaintPct, taintTier } from '../../utils/taintAnalysis';
import { tagKnownEntity, getExplorerUrls } from '../../utils/knownEntities';
import { useWatchlist } from '../../hooks/useWatchlist';
import { getFeeTier } from '../../utils/traceHeuristics';

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
  const feeTier = details.feeRateSatVb ? getFeeTier(details.feeRateSatVb.replace(/[^0-9.]/g,'')) : null;

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
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Reference Hash / Address</span>
              <button
                onClick={() => {
                  const now = toggle(details.address);
                  showToast(now ? 'Added to watchlist' : 'Removed from watchlist', now ? 'success' : 'info');
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

          {/* Forensic Centrality & Flow Metrics */}
          {centralityMetrics && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
              <div style={{ backgroundColor: 'rgba(5, 8, 16, 0.6)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.65rem' }}>Flow In / Out Degree</span>
                <strong style={{ color: '#fff' }}>{centralityMetrics.inDegree} In • {centralityMetrics.outDegree} Out</strong>
              </div>
              <div style={{ backgroundColor: 'rgba(5, 8, 16, 0.6)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.65rem' }}>Transit Hub Status</span>
                <strong style={{ color: centralityMetrics.isHub ? '#f59e0b' : 'var(--text-secondary)' }}>
                  {centralityMetrics.isHub ? '⚡ Transit Flow Hub' : 'Standard Hop'}
                </strong>
              </div>
            </div>
          )}
          {/* Taint Propagation */}
          {taintInfo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderRadius: '6px', backgroundColor: taintInfo.tier.bg, border: `1px solid ${taintInfo.tier.color}30`, fontSize: '0.75rem' }}>
              <Droplets size={13} style={{ color: taintInfo.tier.color }} aria-hidden="true" />
              <span style={{ color: 'var(--text-muted)' }}>Taint from origin:</span>
              <strong style={{ color: taintInfo.tier.color }}>{taintInfo.formatted}</strong>
              <span style={{ marginLeft: 'auto', fontSize: '0.65rem', padding: '0.1rem 0.3rem', borderRadius: '3px', backgroundColor: 'rgba(0,0,0,0.2)', color: taintInfo.tier.color }}>{taintInfo.tier.label}</span>
            </div>
          )}

          {/* Forensic Metadata & Technical Parameters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.825rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Type/Role:</span>
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{selectedNode.type}</span>
            </div>

            {details.scriptStandard && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <FileCode size={13} style={{ color: 'var(--primary)' }} /> Script Standard:
                </span>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{details.scriptStandard}</span>
              </div>
            )}

            {details.feeRateSatVb && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Zap size={13} style={{ color: '#f59e0b' }} /> Fee Rate:
                </span>
                <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>{details.feeRateSatVb} ({details.vsize}) {feeTier && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', borderRadius: '3px', backgroundColor: `${feeTier.color}18`, color: feeTier.color }}>{feeTier.label}</span>}</span>
              </div>
            )}
            {details.blockHeight != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Timer size={12} /> Block:</span>
                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>#{details.blockHeight}</span>
              </div>
            )}

            {details.rbfStatus && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>RBF Protocol:</span>
                <span style={{ fontWeight: 600, color: details.rbfStatus.includes('Enabled') ? '#f59e0b' : 'var(--text-secondary)' }}>
                  {details.rbfStatus}
                </span>
              </div>
            )}

            {details.confirmations && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <CheckCircle2 size={13} style={{ color: '#10b981' }} /> Confirmation:
                </span>
                <span style={{ fontWeight: 600 }}>{details.confirmations}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Last Activity:</span>
              <span style={{ fontWeight: 600 }}>{details.lastActive}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>IP Logs (OSINT):</span>
              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <MapPin size={12} style={{ color: '#ef4444' }} /> {details.ipLog}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>KYC Status:</span>
              <span style={{ fontWeight: 600, color: selectedNode.type === 'receiver' ? '#10b981' : 'var(--text-muted)' }}>
                {details.kycStatus}
              </span>
            </div>

            {/* Cryptographic Script Disassembler Panel */}
            {scriptAnalysis && (
              <div style={{ marginTop: '0.5rem', backgroundColor: 'rgba(5, 8, 16, 0.8)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Code2 size={13} /> Script Disassembly & BIP
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
                    <div style={{ color: '#cbd5e1' }}><strong>ASM Bytecode:</strong> <code style={{ color: 'var(--primary)' }}>{scriptAnalysis.asm}</code></div>
                    <div style={{ color: 'var(--text-muted)' }}>Rating: {scriptAnalysis.securityRating}</div>
                    <div style={{ color: 'var(--text-muted)' }}>Spend: {scriptAnalysis.spendRequirement}</div>
                  </div>
                )}
              </div>
            )}

            {/* Heuristic Breakdown — weighted change vs payment */}
            {details.heuristicBreakdown && (
              <div style={{ marginTop: '0.5rem', backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)', borderRadius: '6px', padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><BarChart3 size={13} /> Forensic Heuristic Score: {details.heuristicScore != null ? `${details.heuristicScore > 0 ? '+' : ''}${details.heuristicScore}` : '—'} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(conf {(details.heuristicConfidence*100).toFixed(0)}%)</span></span>
                  <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '3px', backgroundColor: details.heuristicScore > 1 ? 'rgba(16,185,129,0.15)' : details.heuristicScore < -1 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)', color: details.heuristicScore > 1 ? '#10b981' : details.heuristicScore < -1 ? '#ef4444' : 'var(--text-muted)' }}>{details.heuristicScore > 1 ? 'Payment' : details.heuristicScore < -1 ? 'Change' : 'Ambiguous'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {[
                    ['Script type', details.heuristicBreakdown.scriptScore],
                    ['Reuse/fresh', details.heuristicBreakdown.reuseScore],
                    ['Value round', details.heuristicBreakdown.roundnessScore],
                    ['Position', details.heuristicBreakdown.positionScore],
                    ['Spent', details.heuristicBreakdown.spentScore],
                    ...(details.heuristicBreakdown.fingerprintScore != null ? [['Fingerprint', details.heuristicBreakdown.fingerprintScore]] : []),
                    ...(details.heuristicBreakdown.feeScore != null ? [['Fee ctx', details.heuristicBreakdown.feeScore]] : []),
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
                {details.exchangeConf != null && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Exchange deposit confidence: <strong style={{ color: details.exchangeConf > 0.4 ? '#f59e0b' : 'var(--text-secondary)' }}>{(details.exchangeConf*100).toFixed(0)}%</strong></div>
                )}
              </div>
            )}
            {/* OP_RETURN Decoded Payload Banner */}
            {details.opReturnHex && (
              <div style={{ marginTop: '0.5rem', backgroundColor: 'rgba(168, 85, 247, 0.08)', border: '1px solid #a855f7', borderRadius: '6px', padding: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                  Decoded OP_RETURN Data
                </span>
                {details.opReturnDecoded && (
                  <div style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 600, marginBottom: '0.3rem' }}>
                    "{details.opReturnDecoded}"
                  </div>
                )}
                <div className="mono-addr" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  Raw Hex: {details.opReturnHex}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem' }}>
              <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><ShieldAlert size={12} /> Risk Rationale:</span>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: '1.4' }}>{details.riskReason}</p>
            </div>
          </div>

          {/* Investigator Field Notes & Case Evidence Log */}
          <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <FileEdit size={13} style={{ color: 'var(--primary)' }} /> Investigator Field Notes ({notesList.length})
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

          {/* Expand hop and KYC options */}
          {selectedNode.type === 'receiver' ? (
            <div className="pulse-glow-border" style={{ 
              backgroundColor: 'rgba(16, 185, 129, 0.05)', 
              border: '1px solid #10b981', 
              borderRadius: '8px', 
              padding: '0.75rem' 
            }}>
              <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <User size={12} /> KYC Profile Available
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
                Request Formal Notice
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
              <Search size={14} /> Trace Forward (Query Address Hops)
            </button>
          ) : null}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
          <HelpCircle size={40} />
          <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>Select a node in the graph explorer to inspect its cryptocurrency parameters.</p>
        </div>
      )}
    </div>
  );
}
