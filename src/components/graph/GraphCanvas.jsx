import React, { useRef } from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Download,
  ChevronRight
} from 'lucide-react';
import NodeRenderer from './NodeRenderer';
import { useToast } from '../../hooks/useToast';

export default function GraphCanvas({
  activeCase,
  selectedNode,
  highlightReceiver,
  setHighlightReceiver,
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
  const { showToast } = useToast();

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.15, 3.0));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.15, 0.5));
  const resetView = () => {
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
    setCustomPositions({});
  };

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
        showToast("Exported transaction flow graph as PNG image!", "success");
      };
      img.src = url;
    } catch (err) {
      showToast(`Export failed: ${err.message}`, "error");
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Interactive Fund Flow Tracing</h3>
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
            <option value="hop">Hop / Hub</option>
            <option value="receiver">End Receiver</option>
            <option value="mixer">Mixer</option>
          </select>

          <button
            onClick={handleExportPNG}
            className="btn"
            title="Export Canvas as PNG image"
          >
            <Download size={14} /> PNG
          </button>

          <button
            onClick={() => setHighlightReceiver(!highlightReceiver)}
            className={`btn ${highlightReceiver ? 'btn-warning pulse-glow-border' : 'btn-outline'}`}
          >
            <Sparkles size={14} /> 
            {highlightReceiver ? "Receiver Located" : "Locate End Receiver"}
          </button>
        </div>
      </div>

      {/* SVG Drawing Canvas */}
      <div style={{ 
        flex: 1, 
        backgroundColor: '#05070e', 
        borderRadius: '10px', 
        border: '1px solid var(--border-color)', 
        overflow: 'hidden',
        position: 'relative',
        minHeight: '420px',
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
            {/* Floating Toolbar zoom controls */}
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              zIndex: 10,
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              padding: '4px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)'
            }}>
              <button onClick={handleZoomIn} style={{ padding: '6px', border: 'none', background: 'none', color: 'var(--text-primary)', cursor: 'pointer' }} title="Zoom In" aria-label="Zoom In"><ZoomIn size={16} /></button>
              <button onClick={handleZoomOut} style={{ padding: '6px', border: 'none', background: 'none', color: 'var(--text-primary)', cursor: 'pointer' }} title="Zoom Out" aria-label="Zoom Out"><ZoomOut size={16} /></button>
              <button onClick={resetView} style={{ padding: '6px', border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Reset Fit" aria-label="Reset Zoom and Pan"><Maximize2 size={14} /></button>
            </div>

            {/* End Receiver Forensic Highlight Banner Card */}
            {highlightReceiver && (
              <div className="pulse-glow-border" style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                zIndex: 10,
                backgroundColor: 'rgba(5, 8, 22, 0.92)',
                border: '1px solid #eab308',
                borderRadius: '8px',
                padding: '0.85rem 1.1rem',
                maxWidth: '320px',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 8px 24px rgba(234, 179, 8, 0.25)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#eab308', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Sparkles size={14} /> End Receiver Identified
                  </span>
                  <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', borderRadius: '4px', fontWeight: 700 }}>
                    {activeCase.nodes.find(n => n.type === 'receiver')?.details.kycStatus || 'TERMINAL UTXO'}
                  </span>
                </div>
                {activeCase.nodes.filter(n => n.type === 'receiver').map((rec, idx) => (
                  <div key={idx} style={{ marginTop: '0.4rem', borderTop: idx > 0 ? '1px dashed rgba(255,255,255,0.1)' : 'none', paddingTop: idx > 0 ? '0.4rem' : '0' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{rec.entityName}</div>
                    <div className="mono-addr" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0' }}>{rec.details.address}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Settled Value:</span>
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
                  Draft NDPS Subpoena Notice <ChevronRight size={14} />
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
              </defs>

              {/* Transform group for panning and zooming */}
              <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`} style={{ transformOrigin: 'center' }}>
                <NodeRenderer
                  nodes={activeCase.nodes}
                  links={activeCase.links}
                  getNodeCoords={getNodeCoords}
                  selectedNode={selectedNode}
                  highlightReceiver={highlightReceiver}
                  searchFilter={searchFilter}
                  typeFilter={typeFilter}
                  draggingNodeId={draggingNodeId}
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
          fontSize: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></span>
            <span>Suspect / Input</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6' }}></span>
            <span>Output / Hop</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
            <span>Exchange Deposit</span>
          </div>
        </div>
      </div>
    </div>
  );
}
