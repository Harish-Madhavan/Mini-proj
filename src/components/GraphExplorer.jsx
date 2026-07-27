import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, 
  User, 
  HelpCircle, 
  MapPin, 
  Layers, 
  Cpu, 
  Copy,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download
} from 'lucide-react';

export default function GraphExplorer({ activeCase, onSelectTab, onExpandAddress, isLoadingLive }) {
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightReceiver, setHighlightReceiver] = useState(false);
  const svgRef = useRef(null);
  
  // Interactive Pan and Zoom States
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Custom Node Positions (Node Dragging) & Filtering
  const [customPositions, setCustomPositions] = useState({});
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, initialNodeX: 0, initialNodeY: 0 });
  const [searchFilter, setSearchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    if (activeCase && activeCase.nodes.length > 0) {
      setSelectedNode(activeCase.nodes[0]);
    }
    setHighlightReceiver(false);
    setCustomPositions({});
    setSearchFilter('');
    setTypeFilter('all');
    resetView();
  }, [activeCase]);

  if (!activeCase) return <div style={{ color: 'var(--text-secondary)' }}>No case selected.</div>;

  // Dynamic layout generator with custom drag coordinates support
  const getNodeCoords = (nodeId) => {
    if (customPositions[nodeId]) {
      return customPositions[nodeId];
    }

    const node = activeCase.nodes.find(n => n.id === nodeId);
    if (!node) return { x: 100, y: 100 };

    if (activeCase.id === 'case-btc-01' || activeCase.id === 'case-usdt-02' || activeCase.id === 'case-eth-03') {
      if (node.type === 'suspect') return { x: 80, y: 180 };
      if (node.type === 'receiver') return { x: 680, y: 180 };
      if (node.type === 'mixer') return { x: 380, y: 280 };
      if (node.id === 'addr_hop_1') return { x: 380, y: 90 };
      if (node.id === 'addr_hop_2') return { x: 530, y: 180 };
      if (node.id.startsWith('tx_')) return { x: 380, y: 180 };
    }

    const suspects = activeCase.nodes.filter(n => n.type === 'suspect' || n.id.startsWith('in_'));
    const txHubs = activeCase.nodes.filter(n => n.id.startsWith('tx_'));
    const hops = activeCase.nodes.filter(n => n.type === 'hop' && !n.id.startsWith('tx_') && !n.id.startsWith('in_') && !n.id.startsWith('out_'));
    const receivers = activeCase.nodes.filter(n => n.type === 'receiver' || n.id.startsWith('out_'));
    const mixers = activeCase.nodes.filter(n => n.type === 'mixer');

    if (suspects.some(n => n.id === node.id)) {
      const idx = suspects.findIndex(n => n.id === node.id);
      const spacing = 280 / Math.max(suspects.length, 1);
      return { x: 100, y: 180 - (spacing * (suspects.length - 1)) / 2 + idx * spacing };
    }

    if (txHubs.some(n => n.id === node.id)) {
      const idx = txHubs.findIndex(n => n.id === node.id);
      const spacing = 220 / Math.max(txHubs.length, 1);
      return { x: 300, y: 180 - (spacing * (txHubs.length - 1)) / 2 + idx * spacing };
    }

    if (hops.some(n => n.id === node.id)) {
      const idx = hops.findIndex(n => n.id === node.id);
      const spacing = 220 / Math.max(hops.length, 1);
      return { x: 480, y: 180 - (spacing * (hops.length - 1)) / 2 + idx * spacing };
    }

    if (mixers.some(n => n.id === node.id)) {
      const idx = mixers.findIndex(n => n.id === node.id);
      const spacing = 160 / Math.max(mixers.length, 1);
      return { x: 380, y: 280 - (spacing * (mixers.length - 1)) / 2 + idx * spacing };
    }

    if (receivers.some(n => n.id === node.id)) {
      const idx = receivers.findIndex(n => n.id === node.id);
      const spacing = 280 / Math.max(receivers.length, 1);
      return { x: 680, y: 180 - (spacing * (receivers.length - 1)) / 2 + idx * spacing };
    }

    return { x: 380, y: 180 };
  };

  // Zoom / Pan & Node Drag actions
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

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    alert("Address copied to clipboard!");
  };

  const handleExportPNG = () => {
    if (!svgRef.current) return;
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
    };
    img.src = url;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem', minHeight: '500px' }}>
      
      {/* Interactive Visual Graph panel */}
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
                style={{
                  padding: '0.4rem 0.5rem 0.4rem 1.8rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'rgba(5, 8, 16, 0.9)',
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem',
                  outline: 'none',
                  width: '150px'
                }}
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{
                padding: '0.4rem 0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(5, 8, 16, 0.9)',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                outline: 'none'
              }}
            >
              <option value="all">All Types</option>
              <option value="suspect">Suspect / Input</option>
              <option value="hop">Hop / Hub</option>
              <option value="receiver">End Receiver</option>
              <option value="mixer">Mixer</option>
            </select>

            <button
              onClick={handleExportPNG}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(255,255,255,0.03)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.8rem'
              }}
              title="Export Canvas as PNG image"
            >
              <Download size={14} /> PNG
            </button>

            <button
              onClick={() => setHighlightReceiver(!highlightReceiver)}
              className="pulse-glow-border"
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: highlightReceiver ? '1px solid #eab308' : '1px solid var(--primary)',
                backgroundColor: highlightReceiver ? 'rgba(234, 179, 8, 0.1)' : 'transparent',
                color: highlightReceiver ? '#eab308' : 'var(--primary)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.8rem',
                transition: 'all 0.3s'
              }}
            >
              <Sparkles size={14} /> 
              {highlightReceiver ? "Receiver Located" : "Locate End Receiver"}
            </button>
          </div>
        </div>

        {/* SVG Drawing Canvas */}
        <div style={{ 
          flex: 1, 
          backgroundColor: '#030712', 
          borderRadius: '8px', 
          border: '1px solid var(--border-color)', 
          overflow: 'hidden',
          position: 'relative',
          minHeight: '400px',
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
                <button onClick={handleZoomIn} style={{ padding: '6px', border: 'none', background: 'none', color: 'var(--text-primary)', cursor: 'pointer' }} title="Zoom In"><ZoomIn size={16} /></button>
                <button onClick={handleZoomOut} style={{ padding: '6px', border: 'none', background: 'none', color: 'var(--text-primary)', cursor: 'pointer' }} title="Zoom Out"><ZoomOut size={16} /></button>
                <button onClick={resetView} style={{ padding: '6px', border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Reset Fit"><Maximize2 size={14} /></button>
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
                  
                  {/* Render Links */}
                  {activeCase.links.map((link, i) => {
                    const startCoords = getNodeCoords(link.source);
                    const endCoords = getNodeCoords(link.target);
                    
                    const isHighlighted = selectedNode && (selectedNode.id === link.source || selectedNode.id === link.target);

                    return (
                      <g key={i}>
                        <line
                          x1={startCoords.x}
                          y1={startCoords.y}
                          x2={endCoords.x}
                          y2={endCoords.y}
                          stroke={isHighlighted ? 'var(--primary)' : '#1e293b'}
                          strokeWidth={isHighlighted ? 3 : 1.5}
                          opacity={isHighlighted ? 0.8 : 0.4}
                          markerEnd={isHighlighted ? "url(#arrow-glow)" : "url(#arrow)"}
                          className={isHighlighted ? "moving-dash" : ""}
                        />
                        <rect
                          x={(startCoords.x + endCoords.x) / 2 - 45}
                          y={(startCoords.y + endCoords.y) / 2 - 10}
                          width="90"
                          height="18"
                          rx="4"
                          fill="#0f172a"
                          stroke={isHighlighted ? 'var(--primary)' : 'rgba(255,255,255,0.05)'}
                          strokeWidth={0.5}
                        />
                        <text
                          x={(startCoords.x + endCoords.x) / 2}
                          y={(startCoords.y + endCoords.y) / 2 + 3}
                          textAnchor="middle"
                          fill={isHighlighted ? 'var(--primary)' : 'var(--text-secondary)'}
                          fontSize="9"
                          fontWeight="600"
                        >
                          {link.value}
                        </text>
                      </g>
                    );
                  })}

                  {/* Render Nodes */}
                  {activeCase.nodes.map((node) => {
                    const coords = getNodeCoords(node.id);
                    const isSelected = selectedNode && selectedNode.id === node.id;
                    
                    // Filter matching check
                    const matchesSearch = !searchFilter.trim() || 
                      node.label.toLowerCase().includes(searchFilter.toLowerCase()) || 
                      node.details.address.toLowerCase().includes(searchFilter.toLowerCase()) ||
                      node.entityName.toLowerCase().includes(searchFilter.toLowerCase());
                    
                    const matchesType = typeFilter === 'all' || node.type === typeFilter;
                    const isDimmed = !matchesSearch || !matchesType;

                    let nodeColor = '#3b82f6';
                    if (node.type === 'suspect') nodeColor = '#ef4444';
                    if (node.type === 'mixer') nodeColor = '#a855f7';
                    if (node.type === 'receiver') nodeColor = '#10b981';

                    const isReceiverHighlight = highlightReceiver && node.type === 'receiver';

                    return (
                      <g 
                        key={node.id} 
                        transform={`translate(${coords.x}, ${coords.y})`}
                        onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                        onClick={() => setSelectedNode(node)}
                        style={{ cursor: draggingNodeId === node.id ? 'grabbing' : 'grab', opacity: isDimmed ? 0.2 : 1 }}
                      >
                        {(isSelected || isReceiverHighlight) && (
                          <circle
                            r="28"
                            fill="none"
                            stroke={isReceiverHighlight ? '#eab308' : 'var(--primary)'}
                            strokeWidth="2"
                            opacity="0.8"
                            className="pulse-glow-border"
                          />
                        )}
                        
                        <circle
                          r="20"
                          fill="#1e293b"
                          stroke={isSelected ? 'var(--primary)' : isReceiverHighlight ? '#eab308' : nodeColor}
                          strokeWidth="3"
                        />

                        <text textAnchor="middle" y="5" fill={isSelected ? '#fff' : 'var(--text-primary)'} fontSize="12" fontWeight="bold">
                          {node.id.startsWith('tx_') ? '⚙️' : node.type === 'suspect' ? '🕵️' : node.type === 'receiver' ? '🏦' : node.type === 'mixer' ? '🌪️' : '🔗'}
                        </text>

                        <text textAnchor="middle" y="36" fill="var(--text-primary)" fontSize="10" fontWeight="500">
                          {node.label}
                        </text>
                        <text textAnchor="middle" y="48" fill="var(--text-muted)" fontSize="8" className="mono-addr">
                          {node.details.address.slice(0, 6)}...{node.details.address.slice(-6)}
                        </text>
                      </g>
                    );
                  })}

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

      {/* Metadata Sidebar details panel */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', borderLeft: '3px solid var(--primary-glow)' }}>
        {selectedNode ? (
          <>
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ 
                  fontSize: '0.75rem', 
                  fontWeight: 700, 
                  textTransform: 'uppercase', 
                  padding: '0.2rem 0.5rem', 
                  borderRadius: '4px',
                  backgroundColor: 
                    selectedNode.risk === 'critical' ? 'rgba(239, 68, 68, 0.2)' : 
                    selectedNode.risk === 'high' ? 'rgba(239, 68, 68, 0.1)' : 
                    selectedNode.risk === 'medium' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                  color: 
                    selectedNode.risk === 'critical' ? '#ef4444' : 
                    selectedNode.risk === 'high' ? '#f87171' : 
                    selectedNode.risk === 'medium' ? '#fbbf24' : '#34d399'
                }}>
                  {selectedNode.risk} risk
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>{selectedNode.balance}</span>
              </div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 600, marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {selectedNode.type === 'suspect' ? <ShieldAlert style={{ color: '#ef4444' }} /> : selectedNode.type === 'receiver' ? <Layers style={{ color: '#10b981' }} /> : <Cpu />}
                {selectedNode.entityName}
              </h3>
            </div>

            {/* Address bar */}
            <div style={{ backgroundColor: 'rgba(5, 8, 16, 0.9)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Wallet / Tx Reference</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                <span className="mono-addr" style={{ fontSize: '0.8rem', wordBreak: 'break-all', marginRight: '0.5rem' }}>{selectedNode.details.address}</span>
                <button 
                  onClick={() => handleCopy(selectedNode.details.address)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  title="Copy Reference"
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>

            {/* Forensic Metadata fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Type/Role:</span>
                <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{selectedNode.type}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Last Activity:</span>
                <span style={{ fontWeight: 600 }}>{selectedNode.details.lastActive}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>IP Logs (OSINT):</span>
                <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <MapPin size={12} style={{ color: '#ef4444' }} /> {selectedNode.details.ipLog}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>KYC Status:</span>
                <span style={{ fontWeight: 600, color: selectedNode.type === 'receiver' ? '#10b981' : 'var(--text-muted)' }}>
                  {selectedNode.details.kycStatus}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><ShieldAlert size={12} /> Risk Indicator Rationale:</span>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: '1.4' }}>{selectedNode.details.riskReason}</p>
              </div>
            </div>

            {/* Expand hop and KYC options */}
            {selectedNode.type === 'receiver' ? (
              <div className="pulse-glow-border" style={{ 
                backgroundColor: 'rgba(16, 185, 129, 0.05)', 
                border: '1px solid #10b981', 
                borderRadius: '8px', 
                padding: '0.75rem' 
              }}>
                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <User size={12} /> KYC Profile Available
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.25rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
                  <div>Name: <strong style={{ color: '#fff' }}>{selectedNode.details.ownerName}</strong></div>
                  <div>ID Document: <strong style={{ color: '#fff' }}>{selectedNode.details.kycDocumentId}</strong></div>
                </div>
                <button
                  onClick={() => onSelectTab('osint')}
                  style={{
                    width: '100%',
                    marginTop: '0.75rem',
                    padding: '0.4rem',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: '#10b981',
                    color: '#020617',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  Request Formal Notice
                </button>
              </div>
            ) : !selectedNode.id.startsWith('tx_') && onExpandAddress ? (
              <button
                onClick={() => onExpandAddress(selectedNode.details.address)}
                style={{
                  width: '100%',
                  marginTop: 'auto',
                  padding: '0.6rem',
                  borderRadius: '6px',
                  border: '1px solid var(--primary)',
                  backgroundColor: 'rgba(0, 240, 255, 0.05)',
                  color: 'var(--primary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.25rem',
                  fontSize: '0.85rem'
                }}
              >
                <Search size={14} /> Trace Forward (Query Address Hops)
              </button>
            ) : null}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            <HelpCircle size={40} />
            <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>Select a node in the graph explorer to inspect its cryptocurrency parameters.</p>
          </div>
        )}
      </div>

    </div>
  );
}
