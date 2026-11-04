import React, { useMemo, useState } from 'react';
import { Clock, Download, ExternalLink, ArrowRight } from 'lucide-react';
import { getExplorerUrls } from '../../utils/knownEntities';
import { createTraceSnapshot } from '../../utils/traceSnapshot';
import { downloadJson } from '../../utils/download';
import { useToast } from '../../hooks/useToast';
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
  const { showToast } = useToast();
  const [isExportingSnapshot, setIsExportingSnapshot] = useState(false);
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

  const handleExportSnapshot = async () => {
    setIsExportingSnapshot(true);
    try {
      const snapshot = await createTraceSnapshot(activeCase);
      const safeCaseId = (activeCase.id || 'case').replace(/[^a-zA-Z0-9_-]/g, '-');
      const snapshotDate = snapshot.capturedAt.slice(0, 10);
      downloadJson(snapshot, `aegistrace-trace-snapshot-${safeCaseId}-${snapshotDate}.json`);
      showToast('Trace snapshot downloaded. Its digest detects edits but does not authenticate sources.', 'info', 6000);
    } catch (error) {
      showToast(`Could not export trace snapshot: ${error.message}`, 'error', 6000);
    } finally {
      setIsExportingSnapshot(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}><Clock size={13} aria-hidden="true" /> Timeline · {events.length}</h4>
        <button
          type="button"
          className="btn-quiet"
          onClick={handleExportSnapshot}
          disabled={isExportingSnapshot}
          aria-label="Download integrity-checked trace snapshot"
          title="Download this case and its trace provenance as a SHA-256-digested JSON snapshot"
          style={{ fontSize: '0.76rem' }}
        >
          <Download size={13} aria-hidden="true" />
          {isExportingSnapshot ? 'Preparing snapshot…' : 'Snapshot'}
        </button>
      </div>
      {events.length ? (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', maxHeight: '220px', overflowY: 'auto' }}>
          {events.map(ev => (
            <li key={`${ev.src}-${ev.tgt}-${ev.idx}`} style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border-soft)', fontSize: '0.8rem' }}>
              <span style={{ minWidth: '22px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>{String(ev.idx + 1).padStart(2, '0')}</span>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, overflow: 'hidden' }} title={`${ev.src} → ${ev.tgt}`}>
                <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                  {formatNodeName(ev.srcNode, ev.src)}
                </span>
                <ArrowRight size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                  {formatNodeName(ev.tgtNode, ev.tgt)}
                </span>
              </div>
              <span style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', fontWeight: 500 }}>{ev.value}</span>
              <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.74rem' }}>{ev.timeHint}</span>
              {ev.explorer && <a href={ev.explorer.blockstream} target="_blank" rel="noopener noreferrer" aria-label={`Verify hop ${ev.idx + 1} on explorer`} style={{ color: 'var(--text-muted)' }}><ExternalLink size={12} /></a>}
            </li>
          ))}
        </ol>
      ) : <EmptyState>No timeline events for this case.</EmptyState>}
      {activeCase.traceMeta && (
        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', gap: '0.8rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
          {activeCase.traceMeta.confidence != null && <span>Confidence {(activeCase.traceMeta.confidence * 100).toFixed(0)}% ({activeCase.traceMeta.confidenceLevel})</span>}
          {activeCase.traceMeta.haltReason && <span>Stopped: {HALT_REASONS[activeCase.traceMeta.haltReason] || activeCase.traceMeta.haltReason.toLowerCase().replace(/_/g, ' ')}</span>}
        </div>
      )}
      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>
        Snapshot digest detects changes to the saved payload; it does not verify source authenticity or attribution.
      </p>
    </div>
  );
}
