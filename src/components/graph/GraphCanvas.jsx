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
  X
} from 'lucide-react';
import NodeRenderer from './NodeRenderer';
import { useToast } from '../../hooks/useToast';
import { findCriticalMoneyTrail, detectCircularFlows } from '../../utils/graphAlgorithms';
import { calculateTaintMap, calculateEdgeTaintMap, generateTaintLedger } from '../../utils/taintAnalysis';

function ToolBtn({ active, activeClass = 'btn-primary pulse-glow-border', variant = 'btn-outline', style, children, ...props }) {
  return (
    <button
      type="button"
      className={`btn ${active ? activeClass : variant}`}
      style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', ...style }}
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
  onSelectTab
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
    return calculateEdgeTaintMap(activeCase.nodes, activeCase.links, taintMap);
  }, [activeCase, taintMap]);

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
        ctx.fillStyle = '#030712';
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Interactive Fund Flow Tracing</h3>
            <span className="badge-pill badge-pill-info">
              {activeCase.nodes?.length || 0} nodes · {activeCase.links?.length || 0} links
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Pan canvas, scroll to zoom, drag nodes to re-position.</p>
        </div>
        
        {/* Action & Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: '8px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search address / node..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="input-field"
              style={{ paddingLeft: '1.8rem', width: '150px' }}
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="select-field"
          >
            <option value="all">All Types</option>
            <option value="suspect">Suspect / Input</option>
            <option value="hop">Step / hub</option>
            <option value="receiver">End Receiver</option>
            <option value="mixer">Mixer</option>
            <option value="bridge">Bridge / Swap</option>
          </select>

          {/* Flow Playback Stepper Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', backgroundColor: 'rgba(5, 8, 16, 0.8)', padding: '0.2rem 0.4rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <ToolBtn
              onClick={() => {
                if (playbackStep === null) setPlaybackStep(0);
                setIsPlaying(!isPlaying);
              }}
              active={isPlaying}
              style={{ fontSize: '0.725rem', padding: '0.25rem 0.5rem' }}
              title={isPlaying ? "Pause" : "Play step by step"}
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              {isPlaying ? "Pause" : playbackStep !== null ? `Step ${playbackStep + 1}/${activeCase.links?.length || 0}` : "Play"}
            </ToolBtn>

            {playbackStep !== null && (
              <>
                <ToolBtn
                  onClick={() => setPlaybackStep(prev => Math.min((prev || 0) + 1, (activeCase.links?.length || 1) - 1))}
                  style={{ padding: '0.25rem 0.4rem' }}
                  title="Next step"
                  aria-label="Next step"
                >
                  <SkipForward size={12} />
                </ToolBtn>
                <ToolBtn
                  onClick={() => { setPlaybackStep(null); setIsPlaying(false); }}
                  style={{ padding: '0.25rem 0.4rem', color: 'var(--text-muted)' }}
                  title="Reset playback"
                  aria-label="Reset playback"
                >
                  <RotateCcw size={12} />
                </ToolBtn>
              </>
            )}
          </div>

          {/* Path Isolation Indicator */}
          {isolatedNodeId && (
            <ToolBtn
              onClick={() => setIsolatedNodeId(null)}
              active
              style={{ fontSize: '0.725rem', padding: '0.25rem 0.6rem' }}
              title="Clear path isolation"
              aria-label="Clear path isolation"
            >
              <Eye size={12} /> Isolated view <EyeOff size={12} />
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
            {showCriticalTrail ? "Main trail on" : "Main trail"}
          </ToolBtn>

          <ToolBtn
            onClick={() => {
              const next = !showTaintHeatmap;
              setShowTaintHeatmap(next);
              if (next) showToast(`Fund trace on (${TAINT_MODEL_LABELS[taintModel]}).`, "info");
            }}
            active={showTaintHeatmap}
            activeClass="btn-danger pulse-glow-border"
            aria-pressed={showTaintHeatmap}
            aria-label="Toggle fund tracing"
            title="Show each wallet's share of traced funds"
          >
            <Flame size={13} style={{ color: showTaintHeatmap ? '#ef4444' : 'inherit' }} />
            {showTaintHeatmap ? "Trace on" : "Trace"}
          </ToolBtn>

          {showTaintHeatmap && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <select
                value={taintModel}
                onChange={(e) => {
                  setTaintModel(e.target.value);
                  showToast(`Tracing method: ${TAINT_MODEL_LABELS[e.target.value]}.`, "info");
                }}
                className="select-field"
                style={{ fontSize: '0.725rem', padding: '0.2rem 0.4rem', height: '28px' }}
                title="How traced funds spread across outputs"
              >
                <option value="proportionate">Shared</option>
                <option value="fifo">Oldest first</option>
                <option value="poison">Full spread</option>
              </select>
              <ToolBtn
                onClick={() => setShowTaintLedger(true)}
                style={{ fontSize: '0.725rem', padding: '0.2rem 0.45rem', height: '28px', gap: '0.25rem' }}
                title="Open fund tracing ledger"
              >
                <Table size={12} /> Ledger
              </ToolBtn>
            </div>
          )}

          <ToolBtn
            onClick={() => setHighlightReceiver(!highlightReceiver)}
            active={highlightReceiver}
            activeClass="btn-warning pulse-glow-border"
            aria-pressed={highlightReceiver}
            aria-label="Toggle end receiver highlight"
          >
            <Sparkles size={14} aria-hidden="true" />
            {highlightReceiver ? "Receiver on" : "End receiver"}
          </ToolBtn>
        </div>
      </div>

      {/* Cycle warning */}
      {detectedCycles.length > 0 && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          borderRadius: '6px',
          padding: '0.5rem 0.8rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.8rem',
          color: '#fca5a5'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertTriangle size={15} style={{ color: '#ef4444' }} />
            <strong>Circular flow:</strong>
            <span>{detectedCycles.length} cycle{detectedCycles.length === 1 ? '' : 's'} returning to earlier nodes.</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: '#f87171', fontWeight: 600 }}>Review</span>
        </div>
      )}

      {/* SVG Drawing Canvas */}
      <div style={{ 
        flex: 1, 
        backgroundColor: '#05070e', 
        borderRadius: '10px', 
        border: '1px solid var(--border-color)', 
        overflow: 'hidden',
        position: 'relative',
        minHeight: isFullscreen ? 'calc(100vh - 140px)' : '420px',
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
              gap: '4px',
              zIndex: 10,
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              padding: '6px 4px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}>
              <button onClick={handleZoomIn} type="button" style={{ padding: '6px', border: 'none', background: 'none', color: 'var(--text-primary)', cursor: 'pointer' }} title="Zoom In (+)" aria-label="Zoom In"><ZoomIn size={16} aria-hidden="true" /></button>
              
              <span aria-live="polite" style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--primary)', padding: '2px 0' }}>
                {Math.round(zoom * 100)}%
              </span>

              <button onClick={handleZoomOut} type="button" style={{ padding: '6px', border: 'none', background: 'none', color: 'var(--text-primary)', cursor: 'pointer' }} title="Zoom Out (-)" aria-label="Zoom Out"><ZoomOut size={16} aria-hidden="true" /></button>
              <button onClick={handleCenterFit} type="button" style={{ padding: '6px', border: 'none', background: 'none', color: '#10b981', cursor: 'pointer' }} title="Center View" aria-label="Center View"><Focus size={15} aria-hidden="true" /></button>
              <button onClick={resetView} type="button" style={{ padding: '6px', border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Reset Layout (0)" aria-label="Reset Layout"><Activity size={14} aria-hidden="true" /></button>
            </div>

            {/* End Receiver Forensic Highlight Banner Card */}
            {highlightReceiver && (
              <div className="pulse-glow-border" style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                zIndex: 10,
                backgroundColor: 'rgba(5, 8, 22, 0.94)',
                border: '1px solid #eab308',
                borderRadius: '8px',
                padding: '0.85rem 1.1rem',
                maxWidth: '320px',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 8px 24px rgba(234, 179, 8, 0.25)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#eab308', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Sparkles size={14} /> End receiver found
                  </span>
                  <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', borderRadius: '4px', fontWeight: 700 }}>
                    {activeCase.nodes.find(n => n.type === 'receiver')?.details.kycStatus || 'No end receiver yet'}
                  </span>
                </div>
                {activeCase.nodes.filter(n => n.type === 'receiver').map((rec, idx) => (
                  <div key={idx} style={{ marginTop: '0.4rem', borderTop: idx > 0 ? '1px dashed rgba(255,255,255,0.1)' : 'none', paddingTop: idx > 0 ? '0.4rem' : '0' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{rec.entityName}</div>
                    <div className="mono-addr" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0' }}>{rec.details.address}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Amount:</span>
                      <strong style={{ color: '#10b981' }}>{rec.balance}</strong>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => onSelectTab('osint')}
                  style={{
                    marginTop: '0.75rem',
                    width: '100%',
                    padding: '0.45rem',
                    borderRadius: '5px',
                    border: 'none',
                    backgroundColor: '#eab308',
                    color: '#020617',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.25rem'
                  }}
                >
                  Draft notice <ChevronRight size={14} />
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
              {/* Background interceptor for dragging */}
              <rect id="bg-panner" width="100%" height="100%" fill="transparent" />

              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
                </marker>
                <marker id="arrow-glow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
                </marker>
                <marker id="arrow-taint-high" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                </marker>
                <marker id="arrow-taint-med" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
                </marker>
              </defs>

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
        
        {/* Key / Legend overlay */}
        <div style={{ 
          position: 'absolute', 
          bottom: '10px', 
          left: '10px', 
          display: 'flex', 
          gap: '1rem', 
          backgroundColor: 'rgba(5, 8, 16, 0.85)', 
          padding: '0.5rem 1rem', 
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
          fontSize: '0.75rem',
          backdropFilter: 'blur(4px)',
          flexWrap: 'wrap'
        }}>
          {showTaintHeatmap ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></span>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>High (&gt;75%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></span>
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>Medium (35-75%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Low (2-35%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#94a3b8' }}></span>
                <span style={{ color: '#94a3b8' }}>Clean (&lt;5%)</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></span>
                <span>Start / input</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6' }}></span>
                <span>Output / step</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                <span>Exchange</span>
              </div>
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
