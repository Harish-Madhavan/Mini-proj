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
const SyndicateMap = lazy(() => import('./components/SyndicateMap'));
const RiskAnalyzer = lazy(() => import('./components/RiskAnalyzer'));
const ReportGenerator = lazy(() => import('./components/ReportGenerator'));
const WatchlistMonitor = lazy(() => import('./components/WatchlistMonitor'));

function RouteFallback() {
  return (
    <div className="glass-panel" style={{ padding: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)' }} aria-busy="true" aria-live="polite">
      <span className="mono-addr" style={{ fontSize: '0.85rem' }}>Loading…</span>
    </div>
  );
}
import {
  Radio,
  Wifi,
  WifiOff,
  Command
} from 'lucide-react';
import { NAV_ITEMS } from './constants/navigation';

function AppContent() {
  const { 
    activeCase, 
    liveMode, 
    toggleLiveMode 
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
      } else if (e.altKey && ['1', '2', '3', '4', '5', '6', '7', '8'].includes(e.key)) {
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

  return (
    <div className="app-container">
      
      {/* Global Command Palette */}
      <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} />

      {/* Skip link for keyboard users */}
      <a href="#main-content" className="skip-link" style={{ position: 'absolute', left: '-9999px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }} onFocus={(e) => { e.target.style.left = '12px'; e.target.style.top = '12px'; e.target.style.width = 'auto'; e.target.style.height = 'auto'; e.target.style.background = '#fff'; e.target.style.color = '#000'; e.target.style.padding = '6px 12px'; e.target.style.zIndex = '10000'; }} onBlur={(e) => { e.target.style.left = '-9999px'; e.target.style.width = '1px'; e.target.style.height = '1px'; }}>Skip to main content</a>

      {/* Top Banner Header */}
      <header className="header-banner" role="banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
          <div className="brand-badge">
            <Radio size={16} />
          </div>
          <div>
            <h1 style={{ fontSize: '0.95rem', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
              AegisTrace
            </h1>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '1px' }}>
              {liveMode ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span className="live-beacon"></span> Live
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span className="live-beacon" style={{ backgroundColor: 'var(--text-muted)' }}></span> Offline
                </span>
              )}
              <span style={{ opacity: 0.5 }}>·</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }} title={activeCase.title}>
                {activeCase.title}
              </span>
            </p>
          </div>
        </div>

        {/* Minimal actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <button
            onClick={() => setIsCommandOpen(true)}
            className="btn-quiet"
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isCommandOpen}
            aria-label="Open command palette (Ctrl+K)"
            title="Commands (Ctrl+K)"
          >
            <Command size={14} aria-hidden="true" />
            <kbd aria-hidden="true" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'inherit' }}>
              ⌘K
            </kbd>
          </button>

          <button
            onClick={toggleLiveMode}
            className="btn-quiet"
            type="button"
            aria-pressed={liveMode}
            aria-label={liveMode ? 'Switch to offline mode' : 'Switch to live data mode'}
            title={liveMode ? "Live — switch to offline" : "Offline — switch to live"}
          >
            {liveMode ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}
          </button>
        </div>
      </header>

      {/* Main Tab Navigation */}
      <nav className="main-nav" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id || location.pathname === item.path;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`nav-item ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={`Go to ${item.label}`}
              type="button"
            >
              <Icon size={14} aria-hidden="true" strokeWidth={isActive ? 2 : 1.75} />
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
              <Route path="/syndicate" element={<SyndicateMap />} />
              <Route path="/risk" element={<RiskAnalyzer />} />
              <Route path="/watchlist" element={<WatchlistMonitor />} />
              <Route path="/report" element={<ReportGenerator />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Footer information */}
      <footer className="footer-bar" role="contentinfo">
        <span style={{ color: 'var(--text-muted)' }}>{APP_METADATA.SYSTEM_VERSION}</span>
        <span style={{ color: 'var(--text-muted)', opacity: 0.7 }}>Local session</span>
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
