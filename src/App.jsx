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
const AssetRecovery = lazy(() => import('./features/recovery/AssetRecovery'));
const EvidenceReview = lazy(() => import('./features/evidence/EvidenceReview.jsx'));
const CaseComparison = lazy(() => import('./features/cases/CaseComparison'));
const InvestigationTimeline = lazy(() => import('./features/timeline/InvestigationTimeline'));

const ROUTE_COMPONENTS = {
  dashboard: Dashboard,
  trace: GraphExplorer,
  osint: OSINTIntegrator,
  clustering: HeuristicClustering,
  syndicate: SyndicateMap,
  risk: RiskAnalyzer,
  watchlist: WatchlistMonitor,
  report: ReportGenerator,
  recovery: AssetRecovery,
  evidence: EvidenceReview,
  compare: CaseComparison,
  timeline: InvestigationTimeline
};

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
  Command,
  ChevronDown
} from 'lucide-react';
import { NAV_ITEMS } from './constants/navigation';

const PRIMARY_NAV_IDS = new Set(['dashboard', 'trace', 'watchlist', 'recovery', 'evidence']);

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

  // Global Ctrl+K / Cmd+K and Alt+1..9 / Alt+0 shortcut handler
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandOpen(prev => !prev);
      } else if (e.altKey && ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].includes(e.key)) {
        e.preventDefault();
        const index = e.key === '0' ? 9 : parseInt(e.key, 10) - 1;
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
      <a href="#main-content" className="skip-link">Skip to main content</a>

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

      {/* Keep frequent destinations visible; group secondary tools in a disclosure menu. */}
      <nav className="main-nav" aria-label="Primary">
        {NAV_ITEMS.filter(item => PRIMARY_NAV_IDS.has(item.id)).map((item) => {
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
        <details className="nav-more">
          <summary aria-label="More investigation tools">
            Tools <ChevronDown size={13} aria-hidden="true" />
            {NAV_ITEMS.some(item => !PRIMARY_NAV_IDS.has(item.id) && item.id === currentTab) && (
              <span className="nav-more-active">· {NAV_ITEMS.find(item => item.id === currentTab)?.label}</span>
            )}
          </summary>
          <div className="nav-more-menu" role="group" aria-label="Additional tools">
            {NAV_ITEMS.filter(item => !PRIMARY_NAV_IDS.has(item.id)).map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id || location.pathname === item.path;
              return (
                <button
                  key={item.id}
                  onClick={(event) => {
                    event.currentTarget.closest('details').open = false;
                    navigate(item.path);
                  }}
                  className={`nav-more-item ${isActive ? 'active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={`Go to ${item.label}`}
                  type="button"
                >
                  <Icon size={14} aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </details>
      </nav>

      {/* Main Body panels with React Router Routes */}
      <main className="app-main" id="main-content" tabIndex={-1}>
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              {NAV_ITEMS.map(({ id, path }) => {
                const Page = ROUTE_COMPONENTS[id];
                return Page ? (
                  <Route key={id} path={path} element={<div className="route-page"><Page /></div>} />
                ) : null;
              })}
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
