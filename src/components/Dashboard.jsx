import React, { useState, useMemo } from 'react';
import {
  Search,
  ArrowRight,
  PlusCircle,
  Trash2,
  X,
  FileText
} from 'lucide-react';
import { useCase } from '../hooks/useCase';
import { useToast } from '../hooks/useToast';
import { convertBtcToFiat, validateBtcAddress, parseBtcAmount } from '../utils/forensicUtils';
import { EXCHANGES } from '../constants/legalConstants';
import { useWatchlist } from '../hooks/useWatchlist';
import BatchAddressImporter from './BatchAddressImporter';

const INITIAL_CASE_FORM = {
  title: '',
  suspectName: '',
  suspectAddr: '',
  amount: '5.5000',
  exchange: EXCHANGES[0],
  notes: ''
};

export default function Dashboard() {
  const { 
    scenarios, 
    activeCase, 
    handleSelectCase, 
    handleSearch, 
    handleExportCase, 
    handleImportCase, 
    handleDeleteCase,
    handleCreateCustomCase,
    traceDepth,
    setTraceDepth
  } = useCase();

  const { showToast } = useToast();
  const { watchlist, remove } = useWatchlist();
  const [searchVal, setSearchVal] = useState('');
  const [caseFilter, setCaseFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [newCase, setNewCase] = useState(INITIAL_CASE_FORM);

  const updateNewCase = (key, val) => setNewCase(prev => ({ ...prev, [key]: val }));


  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("File too large (max 2MB).", "error");
      e.target.value = '';
      return;
    }
    if (file.type && file.type !== 'application/json' && !file.name.endsWith('.json')) {
      showToast("Please upload a JSON file.", "warning");
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (handleImportCase) handleImportCase(parsed);
      } catch (err) {
        showToast("Failed to parse JSON file: " + err.message, "error");
      }
    };
    reader.onerror = () => showToast("Failed to read file.", "error");
    reader.readAsText(file);
    e.target.value = '';
  };

  const totalSessionBtc = useMemo(() => {
    return scenarios.reduce((acc, c) => {
      const originNode = c.nodes?.find(n => n.type === 'suspect') || c.nodes?.[0];
      return acc + parseBtcAmount(originNode?.balance);
    }, 0);
  }, [scenarios]);

  const fiatMetrics = useMemo(() => convertBtcToFiat(totalSessionBtc), [totalSessionBtc]);

  const sessionStats = [
    { label: "Cases", value: scenarios.length.toString() },
    { label: "Total traced", value: `${totalSessionBtc.toFixed(2)} BTC`, subValue: fiatMetrics.formattedUsd },
    { label: "Open case", value: activeCase ? (activeCase.title.length > 18 ? activeCase.title.slice(0, 18) + '…' : activeCase.title) : "—" },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchVal.trim()) handleSearch(searchVal.trim());
  };

  const handleCreateCaseSubmit = (e) => {
    e.preventDefault();
    if (!newCase.title.trim()) {
      showToast("Please enter a title.", "error");
      return;
    }

    if (newCase.suspectAddr.trim()) {
      const validation = validateBtcAddress(newCase.suspectAddr.trim());
      if (!validation.isValid) {
        showToast(`Address warning: ${validation.error}`, "warning");
      }
    }

    handleCreateCustomCase({
      title: newCase.title.trim(),
      suspectName: newCase.suspectName.trim() || 'Suspect Entity Alpha',
      suspectAddress: newCase.suspectAddr.trim() || 'bc1q999targetwalletcustomforensicnode',
      amount: `${parseFloat(newCase.amount) || 1.0} BTC`,
      targetExchange: newCase.exchange,
      description: newCase.notes.trim() || 'Notes added by the investigator.'
    });

    setIsModalOpen(false);
    setNewCase(INITIAL_CASE_FORM);
  };

  const filteredCases = useMemo(() => {
    if (!caseFilter.trim()) return scenarios;
    const query = caseFilter.toLowerCase();
    return scenarios.filter(c => 
      c.title.toLowerCase().includes(query) ||
      c.description.toLowerCase().includes(query) ||
      c.id.toLowerCase().includes(query) ||
      c.suspectName?.toLowerCase().includes(query)
    );
  }, [scenarios, caseFilter]);

  const queryType = useMemo(() => {
    const trimmed = searchVal.trim();
    if (!trimmed) return null;
    if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
      return { label: 'Transaction hash', color: 'var(--primary)', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)' };
    }
    if (trimmed.startsWith('bc1') || trimmed.startsWith('1') || trimmed.startsWith('3')) {
      return { label: 'Address', color: 'var(--risk-low)', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' };
    }
    return { label: 'Estimate', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)' };
  }, [searchVal]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '1rem' }}>
      
      {/* Search */}
      <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.01em' }}>
            Trace
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              onClick={() => setIsBatchModalOpen(true)}
              className="btn-quiet"
              type="button"
              aria-haspopup="dialog"
              style={{ fontSize: '0.82rem' }}
              title="Batch import addresses from CSV or dump"
            >
              <FileText size={14} aria-hidden="true" /> Batch import
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="btn-quiet"
              type="button"
              aria-haspopup="dialog"
              style={{ fontSize: '0.82rem' }}
            >
              <PlusCircle size={14} aria-hidden="true" /> New case
            </button>
          </div>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Enter a transaction hash or address to follow funds.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }} aria-label="Blockchain trace search">
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <Search aria-hidden="true" style={{ position: 'absolute', left: '0.85rem', color: 'var(--text-muted)' }} size={15} />
            <label htmlFor="trace-search-input" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Transaction hash or address</label>
            <input
              id="trace-search-input"
              type="text"
              placeholder="Transaction hash or address…"
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              className="mono-addr input-field"
              aria-label="Transaction hash or Bitcoin address"
              autoComplete="off"
              spellCheck={false}
              style={{
                width: '100%',
                paddingLeft: '2.4rem',
                paddingRight: searchVal ? '2rem' : '0.85rem',
                paddingTop: '0.7rem',
                paddingBottom: '0.7rem',
                fontSize: '0.85rem'
              }}
            />
            {searchVal && (
              <button
                type="button"
                onClick={() => setSearchVal('')}
                aria-label="Clear search input"
                style={{ position: 'absolute', right: '0.6rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            aria-label="Run trace for entered hash or address"
            style={{ padding: '0 1.4rem', fontSize: '0.85rem' }}
          >
            Trace <ArrowRight size={14} aria-hidden="true" />
          </button>
        </form>

        {/* Depth + hint — quiet footer row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Paste any mainnet txid or address — every trace is computed live.
            </span>
            {queryType && (
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                · {queryType.label}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <label htmlFor="trace-depth-select" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Trace depth</label>
            <span>Depth</span>
            <select 
              id="trace-depth-select"
              value={traceDepth} 
              onChange={(e) => setTraceDepth(Number(e.target.value))}
              className="select-field"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.78rem', border: '1px solid transparent', background: 'transparent', color: 'var(--text-secondary)' }}
            >
              <option value={1}>1 step</option>
              <option value={2}>2 steps</option>
              <option value={3}>3 steps</option>
            </select>
          </div>
        </div>
      </div>

      {/* Session Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1.5rem', padding: '0 0.25rem' }}>
        {sessionStats.map((st, i) => {
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{st.label}</p>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>{st.value}</h3>
              {st.subValue && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{st.subValue}</p>}
            </div>
          );
        })}
      </div>

      {/* Watchlist Quick Access */}
      {watchlist.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0 0.25rem' }}>
          <h3 style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-muted)' }}>
            Watchlist · {watchlist.length}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {watchlist.slice(0, 5).map((item) => {
              const addr = typeof item === 'string' ? item : item?.address;
              if (!addr) return null;
              return (
                <div key={addr} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 0', borderBottom: '1px solid var(--border-soft)', fontSize: '0.83rem' }}>
                  <span className="mono-addr" style={{ color: 'var(--text-secondary)' }} title={addr}>{addr.slice(0, 12)}…{addr.slice(-6)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <button onClick={() => handleSearch(addr)} className="btn-quiet" style={{ fontSize: '0.79rem' }} aria-label={`Trace ${addr}`}>Trace</button>
                    <button onClick={() => { remove(addr); showToast('Removed from watchlist','info'); }} aria-label="Remove" className="icon-btn"><X size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Case Investigations List */}
      <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
              Cases
            </h3>
            <span style={{ fontSize: '0.79rem', color: 'var(--text-muted)' }}>{filteredCases.length}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={13} aria-hidden="true" style={{ position: 'absolute', left: '9px', color: 'var(--text-muted)' }} />
              <label htmlFor="case-filter-input" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Filter cases</label>
              <input
                id="case-filter-input"
                type="text"
                placeholder="Filter…"
                value={caseFilter}
                onChange={(e) => setCaseFilter(e.target.value)}
                className="input-field"
                aria-label="Filter cases by title or description"
                style={{ paddingLeft: '1.9rem', width: '150px', fontSize: '0.8rem', paddingTop: '0.45rem', paddingBottom: '0.45rem', background: 'transparent', borderColor: 'transparent' }}
              />
            </div>

            <button onClick={() => setIsModalOpen(true)} className="btn btn-primary" title="Create Custom Forensic Case" style={{ fontSize: '0.8rem' }}>
              <PlusCircle size={13} /> New
            </button>
            <label className="btn-quiet" title="Import JSON Case File" style={{ fontSize: '0.8rem' }}>
              Import
              <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            <button onClick={handleExportCase} className="btn-quiet" title="Export All Cases to JSON File" style={{ fontSize: '0.8rem' }}>
              Export
            </button>
          </div>
        </div>

        <hr className="divider" />

        {/* Case Cards */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredCases.map((c) => {
            const originNode = c.nodes?.find(n => n.type === 'suspect') || c.nodes?.[0];
            const caseFiat = convertBtcToFiat(originNode?.balance || '0 BTC');

            return (
              <div 
                key={c.id} 
                className="glass-panel-hover"
                style={{
                  padding: '1rem 0',
                  borderBottom: '1px solid var(--border-soft)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div onClick={() => handleSelectCase(c.id)} style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{c.title}</span>
                    {c.riskScore && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {c.riskScore}% risk
                      </span>
                    )}
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.description} · {caseFiat.formattedUsd}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', flexShrink: 0 }}>
                  <button onClick={() => handleSelectCase(c.id)} className="btn-quiet" style={{ fontSize: '0.8rem' }}>
                    Open <ArrowRight size={13} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCase(c.id);
                    }}
                    className="icon-btn"
                    title="Remove case"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* New Investigation Case Modal Dialog */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)} role="presentation">
          <div className="modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="new-case-title">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 id="new-case-title" style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff' }}>
                <PlusCircle size={18} aria-hidden="true" style={{ color: 'var(--primary)' }} /> New case
              </h3>
              <button onClick={() => setIsModalOpen(false)} aria-label="Close dialog" type="button" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateCaseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label htmlFor="new-case-title-input" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Title *</label>
                <input
                  id="new-case-title-input"
                  type="text"
                  required
                  placeholder="e.g. Operation DarkFlow"
                  value={newCase.title}
                  onChange={(e) => updateNewCase('title', e.target.value)}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Target Entity Alpha"
                    value={newCase.suspectName}
                    onChange={(e) => updateNewCase('suspectName', e.target.value)}
                    className="input-field"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Amount (BTC)</label>
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="5.5000"
                    value={newCase.amount}
                    onChange={(e) => updateNewCase('amount', e.target.value)}
                    className="input-field"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Bitcoin address</label>
                <input
                  type="text"
                  placeholder="bc1q... or 1... or 3..."
                  value={newCase.suspectAddr}
                  onChange={(e) => updateNewCase('suspectAddr', e.target.value)}
                  className="mono-addr input-field"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Destination exchange</label>
                <select
                  value={newCase.exchange}
                  onChange={(e) => updateNewCase('exchange', e.target.value)}
                  className="select-field"
                  style={{ width: '100%' }}
                >
                  {EXCHANGES.map((ex, i) => (
                    <option key={i} value={ex}>{ex}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Notes</label>
                <textarea
                  rows={3}
                  placeholder="Add background notes..."
                  value={newCase.notes}
                  onChange={(e) => updateNewCase('notes', e.target.value)}
                  className="input-field"
                  style={{ width: '100%', resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn">Cancel</button>
                <button type="submit" className="btn btn-primary"><PlusCircle size={14} /> Create Case</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Address Importer Modal Dialog */}
      <BatchAddressImporter
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
      />

    </div>
  );
}
