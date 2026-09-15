import React, { useMemo } from 'react';
import { Clock, ExternalLink, ArrowRight, ShieldAlert, Droplets } from 'lucide-react';
import { getExplorerUrls } from '../../utils/knownEntities';
import EmptyState from '../EmptyState';

const HALT_REASONS = {
  COINJOIN_AT_ROOT: 'stopped at a mixing round',
  NODE_LIMIT: 'too many wallets to show',
};

function formatNodeName(node, fallbackId) {
  if (node?.entityName) return node.entityName;
  if (node?.label) return node.label;
  if (node?.details?.address) {
    const addr = node.details.address;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  }
  if (!fallbackId) return 'Unknown';
  if (fallbackId.startsWith('tx_')) return `Transaction ${fallbackId.slice(3, 9)}…`;
  if (fallbackId.startsWith('out_')) return `Output ${fallbackId.slice(4, 10)}…`;
  if (fallbackId.startsWith('in_')) return `Input ${fallbackId.slice(3, 9)}…`;
  return fallbackId.length > 12 ? `${fallbackId.slice(0, 8)}…` : fallbackId;
}

export default function TransactionTimeline({ activeCase }) {
  const events = useMemo(() => {
    if (!activeCase?.nodes?.length) return [];
    // Derive ordered events from links + node timestamps where available
    // Use block_height / block_time from details if present, else link order
    const nodeById = new Map(activeCase.nodes.map(n => [n.id, n]));
    return (activeCase.links || []).map((l, idx) => {
      const src = typeof l.source === 'object' ? l.source.id : l.source;
      const tgt = typeof l.target === 'object' ? l.target.id : l.target;
      const srcNode = nodeById.get(src);
      const tgtNode = nodeById.get(tgt);
      const addr = tgtNode?.details?.address || tgt;
      const explorer = getExplorerUrls(addr);
      const blockHint = tgtNode?.details?.blockHeight ? `Block ${tgtNode.details.blockHeight}` : (tgtNode?.details?.lastActive || srcNode?.details?.lastActive || l.timestamp || `Step ${idx + 1}`);
      const conf = tgtNode?.details?.heuristicConfidence;
      const score = tgtNode?.details?.heuristicScore;
      return { idx, src, tgt, srcNode, tgtNode, value: l.value, timeHint: blockHint, explorer, conf, score };
    });
  }, [activeCase]);

  if (!events.length) return <EmptyState>No timeline events for this case.</EmptyState>;

  return (
    <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Clock size={14} aria-hidden="true" /> Timeline ({events.length} steps)</h4>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '220px', overflowY: 'auto' }}>
        {events.map(ev => (
          <li key={`${ev.src}-${ev.tgt}-${ev.idx}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.55rem', borderRadius: '6px', backgroundColor: ev.conf != null && ev.conf < 0.55 ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)', border: ev.conf != null && ev.conf < 0.55 ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.04)', fontSize: '0.75rem' }}>
            <span style={{ minWidth: '28px', height: '20px', borderRadius: '10px', backgroundColor: 'var(--primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>{ev.idx + 1}</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, overflow: 'hidden' }} title={`${ev.src} → ${ev.tgt}`}>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                {formatNodeName(ev.srcNode, ev.src)}
              </span>
              <ArrowRight size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontWeight: 500, color: ev.tgtNode?.type === 'receiver' ? 'var(--risk-low)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                {formatNodeName(ev.tgtNode, ev.tgt)}
              </span>
            </div>
            <strong style={{ color: '#fff', whiteSpace: 'nowrap' }}>{ev.value}</strong>
            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.7rem' }}>{ev.timeHint}</span>
            {ev.score != null && <span title={`Score ${ev.score}, ${(ev.conf*100).toFixed(0)}% confidence`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', borderRadius: '3px', backgroundColor: ev.score > 1 ? 'rgba(16,185,129,0.12)' : ev.score < -1 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)', color: ev.score > 1 ? '#10b981' : ev.score < -1 ? '#ef4444' : 'var(--text-muted)' }}>{ev.score > 0 ? `+${ev.score}` : ev.score}</span>}
            {ev.explorer && <a href={ev.explorer.blockstream} target="_blank" rel="noopener noreferrer" aria-label={`Verify hop ${ev.idx + 1} on explorer`} style={{ color: 'var(--primary)' }}><ExternalLink size={12} /></a>}
          </li>
        ))}
      </ol>
      {activeCase.traceMeta && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          {activeCase.traceMeta.confidence != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}><Droplets size={11} /> Confidence {(activeCase.traceMeta.confidence * 100).toFixed(0)}% ({activeCase.traceMeta.confidenceLevel})</span>}
          {activeCase.traceMeta.haltReason && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}><ShieldAlert size={11} /> Stopped: {HALT_REASONS[activeCase.traceMeta.haltReason] || activeCase.traceMeta.haltReason.toLowerCase().replace(/_/g, ' ')}</span>}
        </div>
      )}
    </div>
  );
}
