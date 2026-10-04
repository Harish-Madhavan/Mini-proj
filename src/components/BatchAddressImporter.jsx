import React, { useState, useMemo } from 'react';
import {
  Upload,
  FileText,
  CheckCircle,
  X,
  ListPlus,
  ShieldAlert
} from 'lucide-react';
import { addToWatchlist } from '../utils/watchlistManager';
import { useCase } from '../hooks/useCase';
import { useToast } from '../hooks/useToast';
import { parseAddressCsv } from '../utils/batchImportUtils';

export default function BatchAddressImporter({ isOpen, onClose, onImportComplete }) {
  const { showToast } = useToast();
  const { scenarios, handleCreateCustomCase } = useCase();

  const [rawText, setRawText] = useState('');
  const [activeAction, setActiveAction] = useState('watchlist'); // 'watchlist' | 'case'
  const [caseTitle, setCaseTitle] = useState('Operation Batch Seizure');

  const parsedEntries = useMemo(() => parseAddressCsv(rawText), [rawText]);
  const validEntries = useMemo(() => parsedEntries.filter(e => e.isValid && !e.isDuplicate), [parsedEntries]);
  const invalidEntries = useMemo(() => parsedEntries.filter(e => !e.isValid), [parsedEntries]);

  // Cross-reference against loaded scenarios to detect immediate overlaps
  const overlaps = useMemo(() => {
    if (!validEntries.length || !scenarios?.length) return [];
    const hits = [];
    const targetSet = new Map(validEntries.map(e => [e.address.toLowerCase(), e]));

    scenarios.forEach(sc => {
      (sc.nodes || []).forEach(node => {
        const addr = (node.details?.address || node.id.replace(/^(?:out_|in_)/, '')).toLowerCase();
        if (targetSet.has(addr)) {
          hits.push({
            address: targetSet.get(addr).address,
            caseId: sc.id,
            caseTitle: sc.title,
            nodeType: node.type,
            nodeLabel: node.label
          });
        }
      });
    });
    return hits;
  }, [validEntries, scenarios]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setRawText(event.target.result || '');
      showToast(`Loaded ${file.name}`, 'info');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCommit = () => {
    if (!validEntries.length) {
      showToast('No valid addresses to import.', 'warning');
      return;
    }

    if (activeAction === 'watchlist') {
      let added = 0;
      validEntries.forEach(entry => {
        const res = addToWatchlist({
          address: entry.address,
          tag: entry.tag,
          notes: entry.notes,
          riskTier: entry.riskTier
        });
        if (res.success) added++;
      });
      showToast(`Added ${added} address(es) to real-time watchlist.`, 'success');
    } else if (activeAction === 'case') {
      // Create multi-target case
      const nodes = [
        {
          id: 'batch_hub',
          type: 'suspect',
          label: 'Seized Device Batch Hub',
          entityName: caseTitle,
          balance: `${validEntries.length} Addrs`,
          risk: 'critical',
          details: { batchCount: validEntries.length, addressCount: validEntries.length }
        },
        ...validEntries.map((e, idx) => ({
          id: `target_${idx}`,
          type: 'hop',
          label: e.tag || `Target ${idx + 1}`,
          balance: '0.00 BTC',
          risk: e.riskTier.toLowerCase(),
          details: { address: e.address, notes: e.notes }
        }))
      ];

      const links = validEntries.map((_e, idx) => ({
        source: 'batch_hub',
        target: `target_${idx}`,
        value: 'Seized',
        timestamp: 'Forensic Dump'
      }));

      handleCreateCustomCase({
        title: caseTitle,
        suspectName: 'Multi-Target Syndicate',
        suspectAddress: validEntries[0]?.address || 'bc1qbatch...',
        amount: `${validEntries.length} Targets`,
        description: `Batch investigation generated from ${validEntries.length} addresses.`,
        nodes,
        links
      });
      showToast(`Created multi-target case "${caseTitle}"`, 'success');
    }

    if (onImportComplete) onImportComplete(validEntries);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div 
        className="modal-content glass-panel" 
        onClick={(e) => e.stopPropagation()} 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="batch-import-title"
        style={{ maxWidth: '640px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-soft)', paddingBottom: '0.75rem' }}>
          <h3 id="batch-import-title" style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <FileText size={16} aria-hidden="true" style={{ color: 'var(--primary)' }} /> Batch Address Importer (CSV / Dump)
          </h3>
          <button onClick={onClose} aria-label="Close dialog" type="button" className="icon-btn">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
              Paste Addresses or Upload CSV / TXT File:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <label className="btn btn-quiet" style={{ fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Upload size={13} /> Upload File (.csv / .txt)
                <input type="file" accept=".csv,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
              <button
                type="button"
                onClick={() => setRawText("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh,Seized Wallet A,Phone dump\n1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,Genesis Target,Hardcoded seed\n3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy,Exchange Deposit,Darknet cashout")}
                className="btn-quiet"
                style={{ fontSize: '0.76rem' }}
              >
                Insert Sample
              </button>
            </div>
            <textarea
              rows={4}
              placeholder="Paste one address per line, or CSV format: address, tag, notes, riskTier"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="mono-addr input-field"
              style={{ width: '100%', fontSize: '0.8rem', resize: 'vertical' }}
            />
          </div>

          {/* Metrics summary */}
          {parsedEntries.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '6px' }}>
              <div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Total Lines</p>
                <strong style={{ fontSize: '0.95rem' }}>{parsedEntries.length}</strong>
              </div>
              <div>
                <p style={{ fontSize: '0.72rem', color: 'var(--risk-low)' }}>Valid Addresses</p>
                <strong style={{ fontSize: '0.95rem', color: 'var(--risk-low)' }}>{validEntries.length}</strong>
              </div>
              <div>
                <p style={{ fontSize: '0.72rem', color: invalidEntries.length > 0 ? 'var(--risk-critical)' : 'var(--text-muted)' }}>Invalid / Dupes</p>
                <strong style={{ fontSize: '0.95rem', color: invalidEntries.length > 0 ? 'var(--risk-critical)' : 'inherit' }}>
                  {parsedEntries.length - validEntries.length}
                </strong>
              </div>
            </div>
          )}

          {/* Immediate Cross-Case Overlap Alerts */}
          {overlaps.length > 0 && (
            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f87171', fontSize: '0.8rem', fontWeight: 600 }}>
                <ShieldAlert size={15} /> Immediate Syndicate Hit ({overlaps.length} overlap{overlaps.length > 1 ? 's' : ''})
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Imported addresses match known entities in existing active cases!
              </p>
              <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '90px', overflowY: 'auto' }}>
                {overlaps.map((hit, idx) => (
                  <div key={idx} style={{ fontSize: '0.74rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono-addr" style={{ color: 'var(--text-primary)' }}>{hit.address.slice(0, 14)}…</span>
                    <span style={{ color: 'var(--text-muted)' }}>in <strong>{hit.caseTitle}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Destination */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Destination Action:</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setActiveAction('watchlist')}
                className={`btn ${activeAction === 'watchlist' ? 'btn-primary' : 'btn-quiet'}`}
                style={{ flex: 1, fontSize: '0.78rem' }}
              >
                <ListPlus size={13} /> Add to Watchlist
              </button>
              <button
                type="button"
                onClick={() => setActiveAction('case')}
                className={`btn ${activeAction === 'case' ? 'btn-primary' : 'btn-quiet'}`}
                style={{ flex: 1, fontSize: '0.78rem' }}
              >
                <ShieldAlert size={13} /> Create Consolidated Case
              </button>
            </div>

            {activeAction === 'case' && (
              <input
                type="text"
                placeholder="Case Title"
                value={caseTitle}
                onChange={(e) => setCaseTitle(e.target.value)}
                className="input-field"
                style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}
              />
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} className="btn btn-quiet" style={{ fontSize: '0.8rem' }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={validEntries.length === 0}
              className="btn btn-primary"
              style={{ fontSize: '0.8rem' }}
            >
              <CheckCircle size={14} /> Import {validEntries.length} Address{validEntries.length === 1 ? '' : 'es'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
