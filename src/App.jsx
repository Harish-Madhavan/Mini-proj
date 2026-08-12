import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import GraphExplorer from './components/GraphExplorer';
import OSINTIntegrator from './components/OSINTIntegrator';
import HeuristicClustering from './components/HeuristicClustering';
import RiskAnalyzer from './components/RiskAnalyzer';
import ReportGenerator from './components/ReportGenerator';
import { ToastProvider } from './context/ToastContext';
import { CaseProvider } from './context/CaseContext';
import { useCase } from './hooks/useCase';
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

function AppContent() {
  const { 
    activeCase, 
    activeTab, 
    liveMode, 
    setActiveTab, 
    setLiveMode 
  } = useCase();

  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: Shield },
    { id: 'trace', path: '/trace', label: 'Fund Tracing Explorer', icon: Layers },
    { id: 'osint', path: '/osint', label: 'OSINT & Subpoenas', icon: Globe },
    { id: 'clustering', path: '/clustering', label: 'Wallet Clustering', icon: GitMerge },
    { id: 'risk', path: '/risk', label: 'AI Risk Grading', icon: ShieldAlert },
    { id: 'report', path: '/report', label: 'Forensic Report', icon: FileText }
  ];

  // Sync route path to activeTab
  useEffect(() => {
    const currentPath = location.pathname.substring(1);
    const matchedItem = ['dashboard', 'trace', 'osint', 'clustering', 'risk', 'report'].find(id => id === currentPath);
    if (matchedItem && matchedItem !== activeTab) {
      setActiveTab(matchedItem);
    }
  }, [location.pathname, activeTab, setActiveTab]);

  const handleNavClick = (itemId, itemPath) => {
    setActiveTab(itemId);
    navigate(itemPath);
  };

  return (
    <div className="app-container">
      
      {/* Top Banner Header */}
      <header className="header-banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="brand-badge">
            <Radio size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#fff' }}>
              AEGISTRACE
            </h1>
            <p style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span>NCB Blockchain Forensics Terminal</span>
              <span>•</span>
              <span style={{ color: 'var(--risk-low)', fontWeight: 600 }}>Live Connected</span>
            </p>
          </div>
        </div>

        {/* Current Active Case status pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            onClick={() => setLiveMode(!liveMode)}
            className={`btn ${liveMode ? 'btn-outline' : ''}`}
            style={{
              fontSize: '0.775rem',
              padding: '0.35rem 0.75rem'
            }}
          >
            {liveMode ? <Wifi size={13} /> : <WifiOff size={13} />}
            {liveMode ? "Mainnet Connected" : "Local Mode"}
          </button>
          
          <div className="glass-panel" style={{ padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.775rem', borderRadius: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Query:</span>
            <strong style={{ color: 'var(--primary)' }}>{activeCase.title}</strong>
            <span style={{ fontSize: '0.675rem', backgroundColor: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.3rem', borderRadius: '4px', color: 'var(--text-muted)' }}>
              {activeCase.currency}
            </span>
          </div>
        </div>
      </header>

      {/* Main Tab Navigation */}
      <nav className="main-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id || location.pathname === item.path;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id, item.path)}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Main Body panels with React Router Routes */}
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/trace" element={<GraphExplorer />} />
          <Route path="/osint" element={<OSINTIntegrator />} />
          <Route path="/clustering" element={<HeuristicClustering />} />
          <Route path="/risk" element={<RiskAnalyzer />} />
          <Route path="/report" element={<ReportGenerator />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>

      {/* Footer information */}
      <footer className="footer-bar">
        <span>AegisTrace NCB System V2.8.4 - SIH1675 Live Blockchain Explorer</span>
        <span>Secure Session | Token Encryption: Active</span>
      </footer>

    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <CaseProvider>
          <AppContent />
        </CaseProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
