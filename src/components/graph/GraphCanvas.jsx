import React, { useRef, useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Minimize2,
  Download,
  ChevronRight,
  Focus,
  Activity,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Eye,
  EyeOff,
  GitCommit,
  AlertTriangle,
  Flame,
  Table,
  Layers,
  X
} from 'lucide-react';
import NodeRenderer from './NodeRenderer';
import { useToast } from '../../hooks/useToast';
import { findCriticalMoneyTrail, detectCircularFlows } from '../../utils/graphAlgorithms';
import { calculateTaintMap, calculateEdgeTaintMap, generateTaintLedger } from '../../utils/taintAnalysis';

function ToolBtn({ active, activeClass = 'btn-primary', variant = 'btn-quiet', style, children, ...props }) {
  return (
    <button
      type="button"
      className={`btn ${active ? activeClass : variant}`}
      style={{ fontSize: '0.78rem', padding: '0.3rem 0.55rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', borderColor: 'transparent', ...style }}
      {...props}
    >
      {children}
    </button>
  );
}

export default function GraphCanvas({
  activeCase,
  selectedNode,
  highlightReceiver,
  setHighlightReceiver,
  isolatedNodeId,
  setIsolatedNodeId,
  isPlaying,
  setIsPlaying,
  playbackStep,
  setPlaybackStep,
  zoom,
  setZoom,
  panOffset,
  setPanOffset,
  isPanning,
  setIsPanning,
  panStart,
  setPanStart,
  setCustomPositions,
  draggingNodeId,
  setDraggingNodeId,
  dragStart,
  setDragStart,
  searchFilter,
  setSearchFilter,
  typeFilter,
  setTypeFilter,
  getNodeCoords,
  isLoadingLive,
  onSelectNode,
  onSelectTab,
  isClusterCollapsed = false,
  setIsClusterCollapsed
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const { showToast } = useToast();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCriticalTrail, setShowCriticalTrail] = useState(false);
  const [showTaintHeatmap, setShowTaintHeatmap] = useState(false);
  const [taintModel, setTaintModel] = useState('proportionate');
  const [showTaintLedger, setShowTaintLedger] = useState(false);

  const TAINT_MODEL_LABELS = {
    proportionate: 'Shared',
    fifo: 'Oldest first',
    poison: 'Full spread',
  };

  // Compute critical trail and circular flows
  const criticalTrail = useMemo(() => {
    if (!showCriticalTrail || !activeCase?.nodes?.length || !activeCase?.links?.length) return null;
    return findCriticalMoneyTrail(activeCase.nodes, activeCase.links);
  }, [showCriticalTrail, activeCase]);

  const detectedCycles = useMemo(() => {
    if (!activeCase?.nodes?.length || !activeCase?.links?.length) return [];
    return detectCircularFlows(activeCase.nodes, activeCase.links);
  }, [activeCase]);

  // Compute taint maps
  const taintMap = useMemo(() => {
    if (!activeCase?.nodes?.length) return new Map();
    return calculateTaintMap(activeCase.nodes, activeCase.links, [], taintModel);
  }, [activeCase, taintModel]);

  const edgeTaintMap = useMemo(() => {
    if (!activeCase?.nodes?.length || !activeCase?.links?.length) return new Map();
    return calculateEdgeTaintMap(activeCase.nodes, activeCase.links, taintMap, taintModel);
  }, [activeCase, taintMap, taintModel]);

  const taintLedger = useMemo(() => {
    if (!activeCase?.nodes?.length) return [];
    return generateTaintLedger(activeCase.nodes, activeCase.links, taintMap);
  }, [activeCase, taintMap]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.15, 3.0));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.15, 0.5));

  const resetView = () => {
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
    setCustomPositions({});
    showToast("Graph layout reset to center.", "info");
  };

  const handleCenterFit = () => {
    if (!activeCase?.nodes?.length) return;
    setZoom(1.05);
    setPanOffset({ x: 0, y: 0 });
    showToast("Graph centered.", "info");
  };

  // Keyboard shortcuts for canvas ergonomics (+, -, 0, Space, ESC)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;

      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom(prev => Math.min(prev + 0.15, 3.0));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom(prev => Math.max(prev - 0.15, 0.5));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1.0);
        setPanOffset({ x: 0, y: 0 });
        setCustomPositions({});
        showToast("Graph layout reset to center.", "info");
      } else if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        if (playbackStep === null) setPlaybackStep(0);
        setIsPlaying(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, playbackStep, setIsPlaying, setPlaybackStep, setCustomPositions, setPanOffset, setZoom, showToast]);

  const handleMouseDown = (e) => {
    if (e.target.tagName === 'svg' || e.target.id === 'bg-panner') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleNodeMouseDown = (nodeId, e) => {
    e.stopPropagation();
    setDraggingNodeId(nodeId);
    const coords = getNodeCoords(nodeId);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      initialNodeX: coords.x,
      initialNodeY: coords.y
    });
  };

  const handleMouseMove = (e) => {
    if (draggingNodeId) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;
      setCustomPositions(prev => ({
        ...prev,
        [draggingNodeId]: {
          x: Math.round(dragStart.initialNodeX + dx),
          y: Math.round(dragStart.initialNodeY + dy)
        }
      }));
      return;
    }

    if (!isPanning) return;
    setPanOffset({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.05 : 0.95;
    setZoom(prev => Math.min(Math.max(prev * factor, 0.5), 3.0));
  };

  const handleExportPNG = () => {
    if (!svgRef.current) return;
    try {
      const svgData = new XMLSerializer().serializeToString(svgRef.current);
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        ctx.fillStyle = '#0a0a0b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        const imgURI = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.setAttribute('download', `aegistrace-${activeCase.id}-graph.png`);
        a.setAttribute('href', imgURI);
        a.click();
        showToast("Graph saved as PNG.", "success");
      };
      img.src = url;
    } catch (err) {
      showToast(`Export failed: ${err.message}`, "error");
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`glass-panel ${isFullscreen ? 'fullscreen-canvas' : ''}`} 
      style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Fund flow</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {activeCase.nodes?.length || 0} nodes · {activeCase.links?.length || 0} links
            </span>
          </div>
        </div>
        
        {/* Action & Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} style={{ position: 'absolute', left: '8px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Filter…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="input-field"
              style={{ paddingLeft: '1.8rem', width: '130px', fontSize: '0.79rem', paddingTop: '0.4rem', paddingBottom: '0.4rem', background: 'transparent', borderColor: 'transparent' }}
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="select-field"
            style={{ fontSize: '0.79rem', background: 'transparent', borderColor: 'transparent', color: 'var(--text-muted)' }}
          >
            <option value="all">All</option>
            <option value="suspect">Suspect</option>
            <option value="hop">Hops</option>
            <option value="receiver">Receivers</option>
            <option value="mixer">Mixers</option>
            <option value="bridge">Bridges</option>
          </select>

          {/* Flow Playback Stepper Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.1rem' }}>
            <ToolBtn
              onClick={() => {
                if (playbackStep === null) setPlaybackStep(0);
                setIsPlaying(!isPlaying);
              }}
              active={isPlaying}
              style={{ fontSize: '0.79rem' }}
              title={isPlaying ? "Pause" : "Play step by step"}
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              {isPlaying ? "Pause" : playbackStep !== null ? `${playbackStep + 1}/${activeCase.links?.length || 0}` : "Play"}
            </ToolBtn>

            {playbackStep !== null && (
              <>
                <ToolBtn
                  onClick={() => setPlaybackStep(prev => Math.min((prev || 0) + 1, (activeCase.links?.length || 1) - 1))}
                  style={{ padding: '0.3rem 0.4rem' }}
                  title="Next step"
                  aria-label="Next step"
                >
                  <SkipForward size={13} />
                </ToolBtn>
                <ToolBtn
                  onClick={() => { setPlaybackStep(null); setIsPlaying(false); }}
                  style={{ padding: '0.3rem 0.4rem' }}
                  title="Reset playback"
                  aria-label="Reset playback"
                >
                  <RotateCcw size={13} />
                </ToolBtn>
              </>
            )}
          </div>

          {/* Path Isolation Indicator */}
          {isolatedNodeId && (
            <ToolBtn
              onClick={() => setIsolatedNodeId(null)}
              active
              style={{ fontSize: '0.79rem' }}
              title="Clear path isolation"
              aria-label="Clear path isolation"
            >
              <Eye size={13} /> Isolated <EyeOff size={13} />
            </ToolBtn>
          )}

          <ToolBtn
            onClick={handleExportPNG}
            aria-label="Export canvas as PNG"
            title="Export canvas as PNG image"
          >
            <Download size={14} aria-hidden="true" />
          </ToolBtn>

          <ToolBtn
            onClick={() => setIsFullscreen(!isFullscreen)}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen canvas"}
            aria-pressed={isFullscreen}
            title={isFullscreen ? "Exit Fullscreen (ESC)" : "Enter Fullscreen Canvas"}
          >
            {isFullscreen ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
          </ToolBtn>

          <ToolBtn
            onClick={() => setShowCriticalTrail(!showCriticalTrail)}
            active={showCriticalTrail}
            aria-pressed={showCriticalTrail}
            aria-label="Toggle main money trail highlight"
            title="Highlight the highest-value path from start to end"
          >
            <GitCommit size={13} aria-hidden="true" />
            {showCriticalTrail ? "Trail on" : "Trail"}
          </ToolBtn>

          {setIsClusterCollapsed && (
            <ToolBtn
              onClick={() => {
                const next = !isClusterCollapsed;
                setIsClusterCollapsed(next);
                showToast(next ? "Cluster collapsing enabled (10+ inputs grouped)." : "Cluster collapsing disabled (expanded view).", "info");
              }}
              active={isClusterCollapsed}
              activeClass="btn-primary"
              aria-pressed={isClusterCollapsed}
              aria-label="Toggle input cluster collapsing"
              title="Group co-spent inputs into a single consolidated cluster badge"
            >
              <Layers size={13} aria-hidden="true" />
              {isClusterCollapsed ? "Clusters on" : "Clusters"}
            </ToolBtn>
          )}

          <ToolBtn
            onClick={() => {
              const next = !showTaintHeatmap;
              setShowTaintHeatmap(next);
              if (next) showToast(`Fund trace on (${TAINT_MODEL_LABELS[taintModel]}).`, "info");
            }}
            active={showTaintHeatmap}
            activeClass="btn-primary"
            aria-pressed={showTaintHeatmap}
            aria-label="Toggle fund tracing"
            title="Show each wallet's share of traced funds"
          >
            <Flame size={13} style={{ color: showTaintHeatmap ? 'inherit' : 'var(--text-muted)' }} />
            {showTaintHeatmap ? "Trace on" : "Trace"}
          </ToolBtn>

          {showTaintHeatmap && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <select
                value={taintModel}
                onChange={(e) => {
                  setTaintModel(e.target.value);
                  showToast(`Tracing method: ${TAINT_MODEL_LABELS[e.target.value]}.`, "info");
                }}
                className="select-field"
                style={{ fontSize: '0.78rem', padding: '0.25rem 0.4rem', height: '28px', background: 'transparent', borderColor: 'transparent', color: 'var(--text-muted)' }}
                title="How traced funds spread across outputs"
              >
                <option value="proportionate">Shared</option>
                <option value="fifo">Oldest first</option>
                <option value="poison">Full spread</option>
              </select>
              <ToolBtn
                onClick={() => setShowTaintLedger(true)}
                style={{ fontSize: '0.78rem', height: '28px' }}
                title="Open fund tracing ledger"
              >
                <Table size={13} /> Ledger
              </ToolBtn>
            </div>
          )}

          <ToolBtn
            onClick={() => setHighlightReceiver(!highlightReceiver)}
            active={highlightReceiver}
            activeClass="btn-primary"
            aria-pressed={highlightReceiver}
            aria-label="Toggle end receiver highlight"
          >
            <Sparkles size={14} aria-hidden="true" />
            {highlightReceiver ? "Receiver on" : "Receiver"}
          </ToolBtn>
        </div>
      </div>

      {/* Cycle warning */}
      {detectedCycles.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.79rem',
          color: 'var(--text-muted)',
          padding: '0 0.1rem'
        }}>
          <AlertTriangle size={13} />
          <span>{detectedCycles.length} circular flow{detectedCycles.length === 1 ? '' : 's'} — review churn.</span>
        </div>
      )}

      {/* SVG Drawing Canvas */}
      <div style={{ 
        flex: 1, 
        backgroundColor: 'var(--bg-inset)', 
        borderRadius: '10px', 
        border: '1px solid var(--border-soft)', 
        overflow: 'hidden',
        position: 'relative',
        minHeight: isFullscreen ? 'calc(100vh - 140px)' : '460px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        {isLoadingLive ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: 'var(--primary)' }}>
            <RefreshCw className="moving-dash" size={32} style={{ animation: 'spin 1.5s linear infinite' }} />
            <span>Querying blockchain API...</span>
          </div>
        ) : (
          <>
            {/* Floating Toolbar zoom & fit controls */}
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              zIndex: 10,
              backgroundColor: 'rgba(19,19,22,0.9)',
              padding: '4px 2px',
              borderRadius: '8px',
              border: '1px solid var(--border-soft)'
            }}>
              <button onClick={handleZoomIn} type="button" style={{ padding: '6px', border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Zoom In (+)" aria-label="Zoom In"><ZoomIn size={15} aria-hidden="true" /></button>
              
              <span aria-live="polite" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', padding: '2px 0' }}>
                {Math.round(zoom * 100)}%
              </span>

              <button onClick={handleZoomOut} type="button" style={{ padding: '6px', border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Zoom Out (-)" aria-label="Zoom Out"><ZoomOut size={15} aria-hidden="true" /></button>
              <button onClick={handleCenterFit} type="button" style={{ padding: '6px', border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Center View" aria-label="Center View"><Focus size={14} aria-hidden="true" /></button>
              <button onClick={resetView} type="button" style={{ padding: '6px', border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} title="Reset Layout (0)" aria-label="Reset Layout"><Activity size={13} aria-hidden="true" /></button>
            </div>

            {/* End Receiver highlight — minimal card */}
            {highlightReceiver && (
              <div style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                zIndex: 10,
                backgroundColor: 'rgba(19,19,22,0.94)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '0.8rem 0.9rem',
                maxWidth: '280px'
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    End receiver
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    {activeCase.nodes.find(n => n.type === 'receiver')?.details.kycStatus || '—'}
                  </span>
                </div>
                {activeCase.nodes.filter(n => n.type === 'receiver').map((rec, idx) => (
                  <div key={idx} style={{ marginTop: '0.35rem', borderTop: idx > 0 ? '1px solid var(--border-soft)' : 'none', paddingTop: idx > 0 ? '0.35rem' : '0' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{rec.entityName}</div>
                    <div className="mono-addr" style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '0.15rem 0' }}>{rec.details.address}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginTop: '0.2rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Amount</span>
                      <span style={{ color: 'var(--text-primary)' }}>{rec.balance}</span>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => onSelectTab('osint')}
                  className="btn-quiet"
                  style={{
                    marginTop: '0.6rem',
                    width: '100%',
                    justifyContent: 'center',
                    fontSize: '0.78rem'
                  }}
                >
                  Draft notice <ChevronRight size={13} />
                </button>
              </div>
            )}

            <svg 
              ref={svgRef}
              width="100%" 
              height="100%" 
              viewBox="0 0 800 360" 
              style={{ display: 'block', cursor: draggingNodeId ? 'grabbing' : isPanning ? 'grabbing' : 'grab' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            >
              {/* Subtle dot grid + markers */}
              <defs>
                <pattern id="dot-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="#1c1c21" />
                </pattern>
              </defs>
              <rect id="bg-panner" width="100%" height="100%" fill="url(#dot-grid)" />
              <rect width="100%" height="100%" fill="transparent" />

              {/* Transform group for panning and zooming */}
              <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`} style={{ transformOrigin: 'center' }}>
                <NodeRenderer
                  nodes={activeCase.nodes}
                  links={activeCase.links}
                  getNodeCoords={getNodeCoords}
                  selectedNode={selectedNode}
                  highlightReceiver={highlightReceiver}
                  isolatedNodeId={isolatedNodeId}
                  criticalTrail={criticalTrail}
                  playbackStep={playbackStep}
                  searchFilter={searchFilter}
                  typeFilter={typeFilter}
                  draggingNodeId={draggingNodeId}
                  showTaintHeatmap={showTaintHeatmap}
                  taintMap={taintMap}
                  edgeTaintMap={edgeTaintMap}
                  onNodeMouseDown={handleNodeMouseDown}
                  onSelectNode={onSelectNode}
                />
              </g>
            </svg>
          </>
        )}
        
        {/* Key / Legend overlay — minimal */}
        <div style={{ 
          position: 'absolute', 
          bottom: '10px', 
          left: '12px', 
          display: 'flex', 
          gap: '0.8rem', 
          fontSize: '0.74rem',
          color: 'var(--text-muted)',
          flexWrap: 'wrap'
        }}>
          {showTaintHeatmap ? (
            <>
              <span><span style={{ color: '#f87171' }}>●</span> High ≥75%</span>
              <span><span style={{ color: '#fbbf24' }}>●</span> Med 35–75%</span>
              <span><span style={{ color: '#34d399' }}>●</span> Low 2–35%</span>
              <span><span style={{ color: '#71717a' }}>●</span> Clean</span>
            </>
          ) : (
            <>
              <span><span style={{ color: '#f87171' }}>●</span> Suspect</span>
              <span><span style={{ color: '#8b8b93' }}>●</span> Hop</span>
              <span><span style={{ color: '#34d399' }}>●</span> Receiver</span>
              <span><span style={{ color: '#52525b' }}>○</span> Tx</span>
              {isClusterCollapsed && <span><span style={{ color: '#38bdf8' }}>☷</span> Cluster</span>}
              <span><span style={{ color: '#facc15' }}>⚡</span> Lightning</span>
            </>
          )}
        </div>
      </div>

      {/* Fund tracing ledger modal */}
      {showTaintLedger && (
        <div 
          role="dialog"
          aria-modal="true"
          aria-label="Fund tracing ledger"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(2, 6, 23, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
        >
          <div className="glass-panel" style={{ width: '100%', maxWidth: '850px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Flame style={{ color: '#ef4444' }} size={22} />
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Fund tracing ledger</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Method: <strong style={{ color: '#fff' }}>{TAINT_MODEL_LABELS[taintModel]}</strong> • Case: {activeCase.id} ({activeCase.title})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTaintLedger(false)}
                className="btn btn-outline"
                type="button"
                style={{ padding: '0.35rem 0.5rem' }}
                aria-label="Close ledger"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.5rem' }}>#</th>
                    <th style={{ padding: '0.5rem' }}>Entity / Node</th>
                    <th style={{ padding: '0.5rem' }}>Bitcoin Address</th>
                    <th style={{ padding: '0.5rem' }}>Total Balance</th>
                    <th style={{ padding: '0.5rem' }}>Traced satoshis</th>
                    <th style={{ padding: '0.5rem' }}>Share</th>
                    <th style={{ padding: '0.5rem' }}>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {taintLedger.map((row) => (
                    <tr key={row.nodeId} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>{row.index}</td>
                      <td style={{ padding: '0.5rem', fontWeight: 600 }}>{row.label}</td>
                      <td style={{ padding: '0.5rem' }} className="mono-addr">{row.address ? `${row.address.slice(0, 8)}...${row.address.slice(-8)}` : row.nodeId}</td>
                      <td style={{ padding: '0.5rem' }}>{row.balance}</td>
                      <td style={{ padding: '0.5rem', fontFamily: 'monospace', color: row.taintedSats > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                        {row.taintedSats.toLocaleString()} satoshis
                      </td>
                      <td style={{ padding: '0.5rem', fontWeight: 700, color: row.tier.color }}>
                        {row.taintPct}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <span style={{ 
                          padding: '0.15rem 0.45rem', 
                          borderRadius: '4px', 
                          fontSize: '0.7rem', 
                          fontWeight: 700, 
                          backgroundColor: row.tier.bg, 
                          color: row.tier.color 
                        }}>
                          {row.tier.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span>Record of traced fund shares per wallet.</span>
              <button
                onClick={() => setShowTaintLedger(false)}
                className="btn btn-primary"
                type="button"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.8rem' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
