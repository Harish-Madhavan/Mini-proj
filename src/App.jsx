import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import CommandPalette from './components/CommandPalette';
import { ToastProvider } from './context/ToastContext';
import { CaseProvider } from './context/CaseContext';
import { useCase } from './hooks/useCase';
import ErrorBoundary from './components/ErrorBoundary';
import { APP_METADATA } from './constants/config';

const Dashboard = lazy(() => import('./components/Dashboard'));
const GraphExplorer = lazy(() => import('./components/GraphExplorer'));
const OSINTIntegrator = lazy(() => import('./components/OSINTIntegrator'));
const HeuristicClustering = lazy(() => import('./components/HeuristicClustering'));
const RiskAnalyzer = lazy(() => import('./components/RiskAnalyzer'));
const ReportGenerator = lazy(() => import('./components/ReportGenerator'));

function RouteFallback() {
  return (
    <div className="glass-panel" style={{ padding: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)' }} aria-busy="true" aria-live="polite">
      <span className="mono-addr" style={{ fontSize: '0.85rem' }}>Loading forensic module…</span>
    </div>
  );
}
import { 
  Shield, 
  Layers, 
  GitMerge, 
  ShieldAlert, 
  FileText, 
  Globe,
  Radio,
  Wifi,
  WifiOff,
  Command
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: Shield },
  { id: 'trace', path: '/trace', label: 'Fund Tracing Explorer', icon: Layers },
  { id: 'osint', path: '/osint', label: 'OSINT & Subpoenas', icon: Globe },
  { id: 'clustering', path: '/clustering', label: 'Wallet Clustering', icon: GitMerge },
  { id: 'risk', path: '/risk', label: 'AI Risk Grading', icon: ShieldAlert },
  { id: 'report', path: '/report', label: 'Forensic Report', icon: FileText }
];

function AppContent() {
  const { 
    activeCase, 
    liveMode, 
    setLiveMode 
  } = useCase();

  const navigate = useNavigate();
  const location = useLocation();
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  const currentTab = location.pathname.substring(1) || 'dashboard';

  // Global Ctrl+K / Cmd+K and Alt+1..6 shortcut handler
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandOpen(prev => !prev);
      } else if (e.altKey && ['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        if (NAV_ITEMS[index]) {
          navigate(NAV_ITEMS[index].path);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [navigate]);

  const handleNavClick = (itemPath) => {
    navigate(itemPath);
  };

  return (
    <div className="app-container">
      
      {/* Global Command Palette */}
      <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} />

      {/* Skip link for keyboard users */}
      <a href="#main-content" className="skip-link" style={{ position: 'absolute', left: '-9999px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }} onFocus={(e) => { e.target.style.left = '12px'; e.target.style.top = '12px'; e.target.style.width = 'auto'; e.target.style.height = 'auto'; e.target.style.background = '#fff'; e.target.style.color = '#000'; e.target.style.padding = '6px 12px'; e.target.style.zIndex = '10000'; }} onBlur={(e) => { e.target.style.left = '-9999px'; e.target.style.width = '1px'; e.target.style.height = '1px'; }}>Skip to main content</a>

      {/* Top Banner Header */}
      <header className="header-banner" role="banner">
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
              <span style={{ color: 'var(--risk-low)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span className="live-beacon"></span> Live Connected
              </span>
            </p>
          </div>
        </div>

        {/* Current Active Case status pill & Command Palette Launcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            onClick={() => setIsCommandOpen(true)}
            className="btn btn-outline"
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isCommandOpen}
            aria-label="Open command palette (Ctrl+K)"
            style={{
              fontSize: '0.75rem',
              padding: '0.35rem 0.65rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              color: 'var(--text-secondary)'
            }}
            title="Global Command Palette (Ctrl+K)"
          >
            <Command size={12} aria-hidden="true" />
            <span style={{ fontSize: '0.7rem' }}>Commands</span>
            <kbd aria-hidden="true" style={{ fontSize: '0.6rem', backgroundColor: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px', color: 'var(--text-muted)' }}>
              Ctrl+K
            </kbd>
          </button>

          <button
            onClick={() => setLiveMode(!liveMode)}
            className={`btn ${liveMode ? 'btn-outline' : ''}`}
            type="button"
            aria-pressed={liveMode}
            aria-label={liveMode ? 'Switch to local mode' : 'Switch to mainnet connected mode'}
            style={{
              fontSize: '0.775rem',
              padding: '0.35rem 0.75rem'
            }}
          >
            {liveMode ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
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
      <nav className="main-nav" aria-label="Primary forensic navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id || location.pathname === item.path;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.path)}
              className={`nav-item ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={`Go to ${item.label}`}
              type="button"
            >
              <Icon size={15} aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Main Body panels with React Router Routes */}
      <main style={{ flex: 1 }} id="main-content" tabIndex={-1}>
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
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
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Footer information */}
      <footer className="footer-bar" role="contentinfo">
        <span>{APP_METADATA.SYSTEM_VERSION}</span>
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
