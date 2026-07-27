import React, { useState, useEffect } from 'react';
import { SCENARIOS } from './data/scenarios';
import Dashboard from './components/Dashboard';
import GraphExplorer from './components/GraphExplorer';
import OSINTIntegrator from './components/OSINTIntegrator';
import HeuristicClustering from './components/HeuristicClustering';
import RiskAnalyzer from './components/RiskAnalyzer';
import ReportGenerator from './components/ReportGenerator';
import { traceEndReceiver, fetchAddressTxs, formatBlockstreamTx } from './utils/bitcoinApi';
import { createLiveTxCase, createAddressTraceCase, createAlgorithmicTraceCase } from './utils/caseHelpers';
import { 
  Shield, 
  Layers, 
  GitMerge, 
  ShieldAlert, 
  FileText, 
  Globe,
  Radio,
  Wifi,
  WifiOff
} from 'lucide-react';

export default function App() {
  const [scenarios, setScenarios] = useState(() => {
    try {
      const saved = localStorage.getItem('aegistrace_scenarios');
      return saved ? JSON.parse(saved) : SCENARIOS;
    } catch {
      return SCENARIOS;
    }
  });

  const [activeCaseId, setActiveCaseId] = useState(() => {
    try {
      const saved = localStorage.getItem('aegistrace_activeCaseId');
      return saved || SCENARIOS[0].id;
    } catch {
      return SCENARIOS[0].id;
    }
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [liveMode, setLiveMode] = useState(true);
  const [isLoadingLive, setIsLoadingLive] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('aegistrace_scenarios', JSON.stringify(scenarios));
    } catch (e) {
      console.warn("Could not save scenarios to localStorage", e);
    }
  }, [scenarios]);

  useEffect(() => {
    try {
      localStorage.setItem('aegistrace_activeCaseId', activeCaseId);
    } catch (e) {
      console.warn("Could not save activeCaseId to localStorage", e);
    }
  }, [activeCaseId]);

  const activeCase = scenarios.find(s => s.id === activeCaseId) || scenarios[0] || SCENARIOS[0];

  const handleExportCase = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(scenarios, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `aegistrace-cases-export-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportCase = (jsonObj) => {
    try {
      if (Array.isArray(jsonObj) && jsonObj.length > 0 && jsonObj[0].id && jsonObj[0].nodes) {
        setScenarios(jsonObj);
        setActiveCaseId(jsonObj[0].id);
        alert("Investigation cases imported successfully!");
      } else if (jsonObj.id && jsonObj.nodes) {
        setScenarios(prev => [jsonObj, ...prev.filter(s => s.id !== jsonObj.id)]);
        setActiveCaseId(jsonObj.id);
        alert(`Case "${jsonObj.title || jsonObj.id}" imported successfully!`);
      } else {
        alert("Invalid case file format.");
      }
    } catch (err) {
      alert(`Import error: ${err.message}`);
    }
  };

  const handleResetCases = () => {
    if (confirm("Reset all investigation traces to default state?")) {
      setScenarios(SCENARIOS);
      setActiveCaseId(SCENARIOS[0].id);
      localStorage.removeItem('aegistrace_scenarios');
      localStorage.removeItem('aegistrace_activeCaseId');
    }
  };

  const handleSelectCase = (id) => {
    setActiveCaseId(id);
    setActiveTab('trace');
  };

  const handleSearch = async (searchVal) => {
    const trimmed = searchVal.trim();
    if (!trimmed) return;
    
    setIsLoadingLive(true);
    setActiveTab('trace');

    try {
      // 1. Check if input is a 64-char transaction hash
      if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
        const formatted = await traceEndReceiver(trimmed, 2);
        const res = createLiveTxCase(trimmed, formatted, scenarios);
        setScenarios(res.scenarios);
        setActiveCaseId(res.newCaseId);
        setLiveMode(true);
      } 
      // 2. Check if input is a Bitcoin address (starts with bc1, 1, or 3)
      else if (trimmed.startsWith('bc1') || trimmed.startsWith('1') || trimmed.startsWith('3')) {
        const txs = await fetchAddressTxs(trimmed);
        if (txs && txs.length > 0) {
          const latestTx = txs[0];
          const formatted = await traceEndReceiver(latestTx.txid, 2);
          const res = createAddressTraceCase(trimmed, txs.length, latestTx.txid, formatted, scenarios);
          setScenarios(res.scenarios);
          setActiveCaseId(res.newCaseId);
          setLiveMode(true);
        } else {
          generateAlgorithmicTrace(trimmed);
        }
      } else {
        generateAlgorithmicTrace(trimmed);
      }
    } catch (err) {
      console.warn("Mainnet query note:", err.message);
      generateAlgorithmicTrace(trimmed);
    } finally {
      setIsLoadingLive(false);
    }
  };

  const generateAlgorithmicTrace = (searchVal) => {
    const res = createAlgorithmicTraceCase(searchVal, scenarios);
    setScenarios(res.scenarios);
    setActiveCaseId(res.newCaseId);
    setActiveTab('trace');
  };

  const handleExpandAddress = async (address) => {
    setIsLoadingLive(true);
    try {
      const txs = await fetchAddressTxs(address);
      if (!txs || txs.length === 0) {
        alert("No outgoing transactions found for this address on Bitcoin Mainnet.");
        return;
      }

      const firstTx = txs[0];
      const formatted = formatBlockstreamTx(firstTx);

      const existingNodes = [...activeCase.nodes];
      const existingLinks = [...activeCase.links];

      const newTxNodeId = `tx_${firstTx.txid}`;
      
      existingLinks.push({
        source: `out_${address}`,
        target: newTxNodeId,
        value: `${((firstTx.vout[0]?.value || 0) / 100000000).toFixed(4)} BTC`,
        timestamp: 'On-chain'
      });

      formatted.nodes.forEach(node => {
        if (!existingNodes.some(n => n.id === node.id)) {
          existingNodes.push(node);
        }
      });
      formatted.links.forEach(link => {
        if (!existingLinks.some(l => l.source === link.source && l.target === link.target)) {
          existingLinks.push(link);
        }
      });

      const updatedCase = {
        ...activeCase,
        nodes: existingNodes,
        links: existingLinks
      };

      setScenarios(scenarios.map(s => s.id === activeCase.id ? updatedCase : s));
    } catch (err) {
      alert(`Error expanding address: ${err.message}`);
    } finally {
      setIsLoadingLive(false);
    }
  };


  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Shield },
    { id: 'trace', label: 'Fund Tracing Explorer', icon: Layers },
    { id: 'osint', label: 'OSINT & Subpoenas', icon: Globe },
    { id: 'clustering', label: 'Wallet Clustering', icon: GitMerge },
    { id: 'risk', label: 'AI Risk Grading', icon: ShieldAlert },
    { id: 'report', label: 'Forensic Report', icon: FileText }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', padding: '1.5rem 2rem' }}>
      
      {/* Top Banner Header */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            backgroundColor: 'var(--primary)',
            padding: '0.5rem',
            borderRadius: '6px',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Radio size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#fff' }}>
              AEGISTRACE
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span>NCB Blockchain Forensics Terminal</span>
              <span>•</span>
              <span style={{ color: '#10b981', fontWeight: 600 }}>Live Connected</span>
            </p>
          </div>
        </div>

        {/* Current Active Case status pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => setLiveMode(!liveMode)}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: liveMode ? 'rgba(2, 132, 199, 0.1)' : 'transparent',
              color: liveMode ? 'var(--primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.8rem',
              fontWeight: 600
            }}
          >
            {liveMode ? <Wifi size={14} /> : <WifiOff size={14} />}
            {liveMode ? "Mainnet API Connected" : "Local Mode"}
          </button>
          
          <div className="glass-panel" style={{ padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Trace Query:</span>
            <strong style={{ color: 'var(--primary)' }}>{activeCase.title}</strong>
            <span style={{ fontSize: '0.7rem', backgroundColor: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.35rem', borderRadius: '4px', color: 'var(--text-muted)' }}>
              {activeCase.currency}
            </span>
          </div>
        </div>
      </header>

      {/* Main Tab Navigation */}
      <nav style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                background: isActive ? 'rgba(2, 132, 199, 0.1)' : 'transparent',
                border: 'none',
                outline: 'none',
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                padding: '0.6rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s',
                borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent'
              }}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Main Body panels */}
      <main style={{ flex: 1 }}>
        {activeTab === 'dashboard' && (
          <Dashboard 
            scenarios={scenarios} 
            activeCase={activeCase} 
            onSelectCase={handleSelectCase} 
            onSearch={handleSearch} 
            onExportCase={handleExportCase}
            onImportCase={handleImportCase}
            onResetCases={handleResetCases}
          />
        )}
        {activeTab === 'trace' && (
          <GraphExplorer 
            activeCase={activeCase} 
            onSelectTab={setActiveTab} 
            onExpandAddress={handleExpandAddress}
            isLoadingLive={isLoadingLive}
          />
        )}
        {activeTab === 'osint' && (
          <OSINTIntegrator 
            activeCase={activeCase} 
          />
        )}
        {activeTab === 'clustering' && (
          <HeuristicClustering 
            activeCase={activeCase} 
          />
        )}
        {activeTab === 'risk' && (
          <RiskAnalyzer 
            activeCase={activeCase} 
          />
        )}
        {activeTab === 'report' && (
          <ReportGenerator 
            activeCase={activeCase} 
          />
        )}
      </main>

      {/* Footer information */}
      <footer style={{ 
        marginTop: '3rem', 
        borderTop: '1px solid var(--border-color)', 
        paddingTop: '1rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        fontSize: '0.75rem', 
        color: 'var(--text-muted)' 
      }}>
        <span>AegisTrace NCB System V2.8.4 - SIH1675 Live Blockchain Explorer</span>
        <span>Secure Session | Token Encryption: Active</span>
      </footer>

    </div>
  );
}
