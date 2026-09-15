import React, { useState, useMemo } from 'react';
import { 
  Search, 
  ArrowRight,
  SearchCode,
  FileCheck,
  Radio,
  Layers,
  Cpu,
  Download,
  Upload,
  RotateCcw,
  PlusCircle,
  Trash2,
  X,
  Sliders,
  DollarSign,
  Star,
  Bookmark,
  ExternalLink,
  Copy
} from 'lucide-react';
import { useCase } from '../hooks/useCase';
import { useToast } from '../hooks/useToast';
import { convertBtcToFiat, validateBtcAddress } from '../utils/forensicUtils';
import { EXCHANGES } from '../constants/legalConstants';
import { useWatchlist } from '../hooks/useWatchlist';

import { getExplorerUrls } from '../utils/knownEntities';

import { FORENSIC_CORPUS } from '../data/forensicCorpus';
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
    handleResetCases,
    traceDepth,
    setTraceDepth
  } = useCase();

  const { showToast } = useToast();
  const { watchlist, remove } = useWatchlist();
  const [searchVal, setSearchVal] = useState('');
  const [caseFilter, setCaseFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New custom case form states
  const [newTitle, setNewTitle] = useState('');
  const [newSuspectName, setNewSuspectName] = useState('');
  const [newSuspectAddr, setNewSuspectAddr] = useState('');
  const [newAmount, setNewAmount] = useState('5.5000');
  const [newExchange, setNewExchange] = useState(EXCHANGES[0]);
  const [newNotes, setNewNotes] = useState('');

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

  // Verified live corpus: each query exercises a distinct tracing capability
  const sampleQueries = FORENSIC_CORPUS.map(e => ({ label: e.label, value: e.value, title: `${e.typology} — ${e.expectation}` }));

  // Compute total session value in BTC and Fiat
  const totalSessionBtc = useMemo(() => {
    return scenarios.reduce((acc, c) => {
      const originNode = c.nodes?.find(n => n.type === 'suspect') || c.nodes?.[0];
      const parsed = parseFloat(originNode?.balance?.replace(/[^0-9.]/g, '') || 0);
      return acc + (isNaN(parsed) ? 0 : parsed);
    }, 0);
  }, [scenarios]);

  const fiatMetrics = useMemo(() => {
    return convertBtcToFiat(totalSessionBtc);
  }, [totalSessionBtc]);

  const sessionStats = [
    { label: "Cases", value: scenarios.length.toString(), icon: Layers, color: "var(--primary)" },
    { label: "Total traced", value: `${totalSessionBtc.toFixed(2)} BTC`, subValue: `${fiatMetrics.formattedUsd} (${fiatMetrics.formattedInr})`, icon: DollarSign, color: "#10b981" },
    { label: "Open case", value: activeCase ? activeCase.title.slice(0, 16) + '...' : "None", icon: Cpu, color: "#a855f7" },
    { label: "Data source", value: "Connected", subValue: "Blockstream / Mempool.space", icon: Radio, color: "#f59e0b" }
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchVal.trim()) {
      handleSearch(searchVal.trim());
    }
  };

  const handleSampleClick = (val) => {
    setSearchVal(val);
    handleSearch(val);
  };

  const handleCreateCaseSubmit = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      showToast("Please enter a title.", "error");
      return;
    }

    if (newSuspectAddr.trim()) {
      const validation = validateBtcAddress(newSuspectAddr.trim());
      if (!validation.isValid) {
        showToast(`Address warning: ${validation.error}`, "warning");
      }
    }

    handleCreateCustomCase({
      title: newTitle.trim(),
      suspectName: newSuspectName.trim() || 'Suspect Entity Alpha',
      suspectAddress: newSuspectAddr.trim() || 'bc1q999targetwalletcustomforensicnode',
      amount: `${parseFloat(newAmount) || 1.0} BTC`,
      targetExchange: newExchange,
      description: newNotes.trim() || 'Notes added by the investigator.'
    });

    setIsModalOpen(false);
    setNewTitle('');
    setNewSuspectName('');
    setNewSuspectAddr('');
    setNewAmount('5.5000');
    setNewNotes('');
  };

  // Filter cases based on case search filter
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Search Input Box */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <SearchCode style={{ color: 'var(--primary)' }} size={20} /> Trace a transaction or address
          </h2>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <Sliders size={13} aria-hidden="true" style={{ color: 'var(--primary)' }} />
              <label htmlFor="trace-depth-select" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Trace depth</label>
              <span id="trace-depth-label">Depth:</span>
              <select 
                id="trace-depth-select"
                aria-labelledby="trace-depth-label"
                value={traceDepth} 
                onChange={(e) => setTraceDepth(Number(e.target.value))}
                className="select-field"
                style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
              >
                <option value={1}>1 step (direct)</option>
                <option value={2}>2 steps</option>
                <option value={3}>3 steps (deep)</option>
              </select>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="btn btn-primary"
              type="button"
              aria-haspopup="dialog"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
            >
              <PlusCircle size={14} aria-hidden="true" /> New Case
            </button>
          </div>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
          Enter a transaction hash (64 characters) or an address to follow the money forward.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }} aria-label="Blockchain trace search">
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <Search aria-hidden="true" style={{ position: 'absolute', left: '0.75rem', color: 'var(--text-muted)' }} size={16} />
            <label htmlFor="trace-search-input" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Transaction hash or address</label>
            <input
              id="trace-search-input"
              type="text"
              placeholder="Enter tx hash or address (e.g. bc1q...)"
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              className="mono-addr input-field"
              aria-label="Transaction hash or Bitcoin address"
              autoComplete="off"
              spellCheck={false}
              style={{
                width: '100%',
                paddingLeft: '2.25rem',
                paddingRight: searchVal ? '2rem' : '0.65rem',
                paddingTop: '0.6rem',
                paddingBottom: '0.6rem',
                fontSize: '0.825rem'
              }}
            />
            {searchVal && (
              <button
                type="button"
                onClick={() => setSearchVal('')}
                aria-label="Clear search input"
                style={{
                  position: 'absolute',
                  right: '0.6rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            aria-label="Run trace for entered hash or address"
            style={{ padding: '0 1.25rem', fontSize: '0.825rem' }}
          >
            Run Trace <ArrowRight size={15} aria-hidden="true" />
          </button>
        </form>

        {/* Live query format pill & Quick Sample Queries */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Try:</span>
            {sampleQueries.map((sq, i) => (
              <button
                key={i}
                onClick={() => handleSampleClick(sq.value)}
                className="btn"
                title={sq.title}
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
              >
                {sq.label}
              </button>
            ))}
          </div>
          {queryType && (
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                color: queryType.color,
                backgroundColor: queryType.bg,
                border: `1px solid ${queryType.border}`,
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              Detected: {queryType.label}
            </span>
          )}
        </div>
      </div>

      {/* Session Metrics Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
        {sessionStats.map((st, i) => {
          const Icon = st.icon;
          return (
            <div 
              key={i} 
              className="glass-panel" 
              style={{ 
                padding: '1rem', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between'
              }}
            >
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>{st.label}</p>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginTop: '0.2rem', color: '#fff' }}>{st.value}</h3>
                {st.subValue && (
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{st.subValue}</p>
                )}
              </div>
              <div style={{ padding: '0.5rem', borderRadius: '4px', backgroundColor: '#27272a', color: '#fff' }}>
                <Icon size={18} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Watchlist Quick Access */}
      {watchlist.length > 0 && (
        <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Star size={14} style={{ color: '#f59e0b' }} aria-hidden="true" /> Watchlist ({watchlist.length}) <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.75rem' }}>— starred from graph nodes, persists locally</span></h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {watchlist.map(addr => {
              const explorer = getExplorerUrls(addr);
              return (
                <div key={addr} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.5rem', borderRadius: '6px', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', fontSize: '0.75rem' }}>
                  <Bookmark size={11} style={{ color: '#f59e0b' }} aria-hidden="true" />
                  <span className="mono-addr" style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={addr}>{addr.slice(0, 10)}...{addr.slice(-6)}</span>
                  <button onClick={() => handleSearch(addr)} className="btn" style={{ padding: '0.1rem 0.3rem', fontSize: '0.65rem' }} aria-label={`Trace ${addr}`}>Trace</button>
                  {explorer && <a href={explorer.mempool} target="_blank" rel="noopener noreferrer" aria-label="Open watchlist address"><ExternalLink size={11} /></a>}
                  <button onClick={() => { remove(addr); showToast('Removed from watchlist','info'); }} aria-label="Remove from watchlist" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={11} /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Case Investigations List */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileCheck size={18} style={{ color: 'var(--primary)' }} /> Cases
              </h3>
            <span className="badge-pill badge-pill-info">{filteredCases.length} Cases</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Search Filter */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: '8px', color: 'var(--text-muted)' }} />
              <label htmlFor="case-filter-input" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Filter cases</label>
              <input
                id="case-filter-input"
                type="text"
                placeholder="Filter cases..."
                value={caseFilter}
                onChange={(e) => setCaseFilter(e.target.value)}
                className="input-field"
                aria-label="Filter cases by title or description"
                style={{ paddingLeft: '1.8rem', width: '140px', fontSize: '0.75rem' }}
              />
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="btn btn-primary"
              title="Create Custom Forensic Case"
            >
              <PlusCircle size={14} /> New Case
            </button>

            <label
              className="btn"
              title="Import JSON Case File"
            >
              <Upload size={14} /> Import
              <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>

            <button
              onClick={handleExportCase}
              className="btn"
              title="Export All Cases to JSON File"
            >
              <Download size={14} /> Export
            </button>

            <button
              onClick={handleResetCases}
              className="btn"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.2)' }}
              title="Reset Traces to Default"
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        {/* Case Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredCases.map((c) => {
            const originNode = c.nodes?.find(n => n.type === 'suspect') || c.nodes?.[0];
            const caseFiat = convertBtcToFiat(originNode?.balance || '0 BTC');
            const receiverNode = c.nodes?.find(n => n.type === 'receiver');

            return (
              <div 
                key={c.id} 
                className="glass-panel-hover"
                style={{
                  padding: '1rem 1.25rem',
                  borderRadius: '8px',
                  border: activeCase?.id === c.id ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  backgroundColor: activeCase?.id === c.id ? 'rgba(2, 132, 199, 0.08)' : 'rgba(255, 255, 255, 0.01)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div 
                  onClick={() => handleSelectCase(c.id)}
                  style={{ flex: 1, cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{c.title}</span>
                    <span className="badge-pill badge-pill-success">
                      {c.currency}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                      ≈ {caseFiat.formattedUsd} ({caseFiat.formattedInr})
                    </span>
                    {c.riskScore && (
                      <span className={`badge-pill ${c.riskScore > 75 ? 'badge-pill-danger' : 'badge-pill-warning'}`}>
                        {c.riskScore}% Risk
                      </span>
                    )}
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                    {c.description} {receiverNode ? `• Terminal: ${receiverNode.entityName}` : ''}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleSelectCase(c.id)}
                    className="btn btn-outline"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                  >
                    <span>Open</span> <ArrowRight size={13} />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(JSON.stringify(c, null, 2));
                      showToast(`Case copied to clipboard.`, 'success');
                    }}
                    className="btn btn-outline"
                    style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
                    title="Copy Case JSON data"
                    aria-label={`Copy ${c.title} JSON`}
                  >
                    <Copy size={13} />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCase(c.id);
                    }}
                    className="btn"
                    style={{ 
                      color: '#ef4444', 
                      borderColor: 'rgba(239, 68, 68, 0.2)', 
                      backgroundColor: 'rgba(239, 68, 68, 0.05)',
                      padding: '0.35rem 0.5rem'
                    }}
                    title="Remove case from session"
                  >
                    <Trash2 size={13} />
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
              <button 
                onClick={() => setIsModalOpen(false)}
                aria-label="Close dialog"
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
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
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
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
                    value={newSuspectName}
                    onChange={(e) => setNewSuspectName(e.target.value)}
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
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
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
                  value={newSuspectAddr}
                  onChange={(e) => setNewSuspectAddr(e.target.value)}
                  className="mono-addr input-field"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Destination exchange</label>
                <select
                  value={newExchange}
                  onChange={(e) => setNewExchange(e.target.value)}
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
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  <PlusCircle size={14} /> Create Case
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
