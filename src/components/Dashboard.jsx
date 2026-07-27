import React, { useState } from 'react';
import { 
  Search, 
  ArrowRight,
  Database,
  SearchCode,
  FileCheck,
  Radio,
  Layers,
  Cpu,
  Download,
  Upload,
  RotateCcw
} from 'lucide-react';

export default function Dashboard({ 
  scenarios, 
  activeCase, 
  onSelectCase, 
  onSearch, 
  onExportCase, 
  onImportCase, 
  onResetCases 
}) {
  const [searchVal, setSearchVal] = useState('');

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (onImportCase) onImportCase(parsed);
      } catch (err) {
        alert("Failed to parse JSON file: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const sampleQueries = [
    { label: "Sample BTC Tx Hash", value: "4b9a8f2e71d3c05c8a9f0e1d2c3b4a5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b" },
    { label: "Sample BTC Address", value: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" }
  ];

  const sessionStats = [
    { label: "Active Traced Queries", value: scenarios.length.toString(), icon: Layers, color: "var(--primary)" },
    { label: "Current Selected Trace", value: activeCase ? activeCase.currency : "None", icon: Cpu, color: "#a855f7" },
    { label: "API Gateway", value: "Blockstream Live", icon: Radio, color: "#10b981" },
    { label: "Database Connection", value: "Ready", icon: Database, color: "#f59e0b" }
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchVal.trim()) {
      onSearch(searchVal.trim());
    }
  };

  const handleSampleClick = (val) => {
    setSearchVal(val);
    onSearch(val);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Search Input Box */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: '4px solid var(--primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <SearchCode style={{ color: 'var(--primary)' }} size={22} /> Trace On-Chain Transaction / Address
          </h2>
          <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontWeight: 600 }}>
            Mainnet Live Connected
          </span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Enter any Bitcoin transaction hash (64 hex characters) or address (starting with bc1, 1, or 3) to execute outspend tracking.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
            <input
              type="text"
              placeholder="Enter Tx Hash (e.g. 4b9a8f2e...) or Address (e.g. bc1q...)"
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              className="mono-addr"
              style={{
                width: '100%',
                padding: '0.75rem 0.75rem 0.75rem 2.5rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(5, 8, 16, 0.8)',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: '0.85rem'
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '0 1.5rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'var(--primary)',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem'
            }}
          >
            Run Trace <ArrowRight size={16} />
          </button>
        </form>

        {/* Quick Sample Queries */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Try Quick Query:</span>
          {sampleQueries.map((sq, i) => (
            <button
              key={i}
              onClick={() => handleSampleClick(sq.value)}
              style={{
                fontSize: '0.75rem',
                padding: '0.25rem 0.6rem',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              {sq.label}
            </button>
          ))}
        </div>
      </div>

      {/* Session Metrics Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        {sessionStats.map((st, i) => {
          const Icon = st.icon;
          return (
            <div key={i} className="glass-panel" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{st.label}</p>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '0.2rem', color: '#fff' }}>{st.value}</h3>
              </div>
              <div style={{ padding: '0.6rem', borderRadius: '6px', backgroundColor: 'rgba(255, 255, 255, 0.03)', color: st.color }}>
                <Icon size={20} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Case Investigations List */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileCheck size={18} style={{ color: 'var(--primary)' }} /> Active Session Traces
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
              title="Import JSON Case File"
            >
              <Upload size={14} /> Import Case
              <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>

            <button
              onClick={onExportCase}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
              title="Export All Cases to JSON File"
            >
              <Download size={14} /> Export JSON
            </button>

            <button
              onClick={onResetCases}
              style={{
                padding: '0.4rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
                color: '#f87171',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
              title="Reset Traces to Default"
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {scenarios.map((c) => (
            <div 
              key={c.id} 
              onClick={() => onSelectCase(c.id)}
              className="glass-panel-hover"
              style={{
                padding: '1rem 1.25rem',
                borderRadius: '6px',
                cursor: 'pointer',
                border: activeCase?.id === c.id ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                backgroundColor: activeCase?.id === c.id ? 'rgba(2, 132, 199, 0.08)' : 'rgba(255, 255, 255, 0.01)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{c.title}</span>
                  <span style={{ 
                    fontSize: '0.7rem', 
                    padding: '0.15rem 0.4rem', 
                    borderRadius: '4px', 
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    color: '#10b981',
                    fontWeight: 600
                  }}>
                    {c.currency}
                  </span>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>{c.description}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 600 }}>
                <span>Open Graph</span> <ArrowRight size={14} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
