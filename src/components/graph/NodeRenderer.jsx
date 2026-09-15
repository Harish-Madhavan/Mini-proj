import React from 'react';

export default function NodeRenderer({
  nodes,
  links,
  getNodeCoords,
  selectedNode,
  highlightReceiver,
  isolatedNodeId,
  criticalTrail = null,
  playbackStep,
  searchFilter,
  typeFilter,
  draggingNodeId,
  showTaintHeatmap = false,
  taintMap = new Map(),
  edgeTaintMap = new Map(),
  onNodeMouseDown,
  onSelectNode
}) {
  // Compute isolated path connected nodes and links if path isolation is active
  const isolatedConnectedNodeIds = new Set();
  const isolatedConnectedLinkIndices = new Set();

  if (isolatedNodeId) {
    isolatedConnectedNodeIds.add(isolatedNodeId);
    links.forEach((link, idx) => {
      const src = typeof link.source === 'object' ? link.source.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target.id : link.target;
      if (src === isolatedNodeId || tgt === isolatedNodeId) {
        isolatedConnectedNodeIds.add(src);
        isolatedConnectedNodeIds.add(tgt);
        isolatedConnectedLinkIndices.add(idx);
      }
    });
  }

  const criticalNodeSet = new Set(criticalTrail?.path || []);
  const criticalLinkSet = new Set(criticalTrail?.linkIndices || []);

  return (
    <>
      {/* Render Links */}
      {links.map((link, i) => {
        const src = typeof link.source === 'object' ? link.source.id : link.source;
        const tgt = typeof link.target === 'object' ? link.target.id : link.target;
        const startCoords = getNodeCoords(src);
        const endCoords = getNodeCoords(tgt);
        const isSelectedLink = selectedNode && (selectedNode.id === src || selectedNode.id === tgt);
        const isPlaybackActive = playbackStep !== null && playbackStep === i;
        const isPlaybackPast = playbackStep !== null && i < playbackStep;
        const isIsolatedLink = isolatedNodeId ? isolatedConnectedLinkIndices.has(i) : true;
        const isCriticalLink = criticalTrail && criticalLinkSet.has(i);

        const edgeTaint = edgeTaintMap.get(`${src}->${tgt}`);
        const taintVal = edgeTaint ? edgeTaint.taint : 0;
        const taintColor = edgeTaint ? edgeTaint.color : '#475569';

        const isDimmed = (isolatedNodeId && !isIsolatedLink) || 
                         (playbackStep !== null && i > playbackStep) ||
                         (criticalTrail && !isCriticalLink && !isolatedNodeId);

        const isHighlighted = isSelectedLink || isPlaybackActive || isPlaybackPast || isCriticalLink;

        let linkStroke = '#1e293b';
        let linkWidth = 1.5;
        let marker = 'url(#arrow)';

        if (showTaintHeatmap && edgeTaint) {
          linkStroke = taintColor;
          linkWidth = 2 + Math.round(taintVal * 3);
          marker = taintVal >= 0.75 ? 'url(#arrow-taint-high)' : taintVal >= 0.35 ? 'url(#arrow-taint-med)' : 'url(#arrow-glow)';
        } else if (isCriticalLink) {
          linkStroke = '#38bdf8';
          linkWidth = 4;
          marker = 'url(#arrow-glow)';
        } else if (isPlaybackActive) {
          linkStroke = '#eab308';
          linkWidth = 4;
          marker = 'url(#arrow-glow)';
        } else if (isHighlighted) {
          linkStroke = 'var(--primary)';
          linkWidth = 3;
          marker = 'url(#arrow-glow)';
        }

        return (
          <g key={i} style={{ opacity: isDimmed ? 0.12 : 1, transition: 'opacity 0.3s ease' }}>
            <title>{`Step ${i + 1}: ${link.value} (${link.timestamp || 'On chain'})\nFrom: ${src}\nTo: ${tgt}${showTaintHeatmap && edgeTaint ? `\nTraced funds: ${(taintVal * 100).toFixed(1)}%` : ''}${isCriticalLink ? '\n[MAIN TRAIL]' : ''}`}</title>
            <line
              x1={startCoords.x}
              y1={startCoords.y}
              x2={endCoords.x}
              y2={endCoords.y}
              stroke={linkStroke}
              strokeWidth={linkWidth}
              strokeDasharray={isPlaybackActive ? "6,3" : showTaintHeatmap && taintVal > 0.5 ? "8,2" : "none"}
              opacity={isHighlighted || (showTaintHeatmap && taintVal > 0.1) ? 0.95 : 0.4}
              markerEnd={marker}
              className={isHighlighted || isPlaybackActive || isCriticalLink || (showTaintHeatmap && taintVal > 0.5) ? "moving-dash" : ""}
            />
            <rect
              x={(startCoords.x + endCoords.x) / 2 - (showTaintHeatmap ? 55 : 45)}
              y={(startCoords.y + endCoords.y) / 2 - 10}
              width={showTaintHeatmap ? 110 : 90}
              height="18"
              rx="4"
              fill="#0f172a"
              stroke={showTaintHeatmap && edgeTaint ? taintColor : isCriticalLink ? '#38bdf8' : isPlaybackActive ? '#eab308' : isHighlighted ? 'var(--primary)' : 'rgba(255,255,255,0.05)'}
              strokeWidth={isCriticalLink || isPlaybackActive || (showTaintHeatmap && taintVal > 0.2) ? 1.5 : 0.5}
            />
            <text
              x={(startCoords.x + endCoords.x) / 2}
              y={(startCoords.y + endCoords.y) / 2 + 3}
              textAnchor="middle"
              fill={showTaintHeatmap && edgeTaint ? taintColor : isCriticalLink ? '#38bdf8' : isPlaybackActive ? '#eab308' : isHighlighted ? 'var(--primary)' : 'var(--text-secondary)'}
              fontSize="9"
              fontWeight="600"
            >
              {showTaintHeatmap && edgeTaint 
                ? `${link.value} [${Math.round(taintVal * 100)}%]` 
                : link.value}
            </text>
          </g>
        );
      })}

      {/* Render Nodes */}
      {nodes.map((node) => {
        const coords = getNodeCoords(node.id);
        const isSelected = selectedNode && selectedNode.id === node.id;
        const isIsolatedNode = isolatedNodeId ? isolatedConnectedNodeIds.has(node.id) : true;
        const isCriticalNode = criticalTrail && criticalNodeSet.has(node.id);

        // Filter matching check
        const matchesSearch = !searchFilter.trim() ||
          node.label.toLowerCase().includes(searchFilter.toLowerCase()) ||
          node.details?.address?.toLowerCase().includes(searchFilter.toLowerCase()) ||
          node.entityName?.toLowerCase().includes(searchFilter.toLowerCase());

        const matchesType = typeFilter === 'all' || node.type === typeFilter;
        const isDimmed = !matchesSearch || !matchesType || !isIsolatedNode || (criticalTrail && !isCriticalNode && !isolatedNodeId);

        let nodeColor = '#3b82f6';
        if (node.type === 'suspect') nodeColor = '#ef4444';
        if (node.type === 'mixer') nodeColor = '#a855f7';
        if (node.type === 'receiver') nodeColor = '#10b981';

        const nodeTaint = taintMap.get(node.id) ?? 0;
        let taintHaloColor = '#94a3b8';
        if (nodeTaint >= 0.75) taintHaloColor = '#ef4444';
        else if (nodeTaint >= 0.35) taintHaloColor = '#f59e0b';
        else if (nodeTaint > 0.05) taintHaloColor = '#10b981';

        const isReceiverHighlight = highlightReceiver && node.type === 'receiver';
        const isIsolatedSelf = isolatedNodeId === node.id;

        const handleKeyDown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectNode(node);
          }
        };

        return (
          <g
            key={node.id}
            role="button"
            tabIndex={0}
            aria-label={`Select ${node.type} node ${node.entityName} address ${node.details?.address}`}
            transform={`translate(${coords.x}, ${coords.y})`}
            onMouseDown={(e) => onNodeMouseDown(node.id, e)}
            onClick={() => onSelectNode(node)}
            onKeyDown={handleKeyDown}
            style={{ 
              cursor: draggingNodeId === node.id ? 'grabbing' : 'grab', 
              opacity: isDimmed ? 0.15 : 1,
              transition: 'opacity 0.3s ease'
            }}
          >
            {(isSelected || isReceiverHighlight || isIsolatedSelf || isCriticalNode || (showTaintHeatmap && nodeTaint > 0.05)) && (
              <circle
                r="26"
                fill="none"
                stroke={showTaintHeatmap ? taintHaloColor : isCriticalNode ? '#3b82f6' : isReceiverHighlight ? '#f59e0b' : isIsolatedSelf ? '#0ea5e9' : '#3b82f6'}
                strokeWidth={showTaintHeatmap ? (nodeTaint > 0.5 ? 3 : 2) : 2}
                strokeDasharray={showTaintHeatmap && nodeTaint > 0.5 ? "4,2" : "none"}
              />
            )}

            <circle
              r="20"
              fill="#1e293b"
              stroke={showTaintHeatmap ? taintHaloColor : isSelected ? 'var(--primary)' : isCriticalNode ? '#38bdf8' : isReceiverHighlight ? '#eab308' : nodeColor}
              strokeWidth="3"
            />

            <text textAnchor="middle" y="5" fill={isSelected ? '#fff' : 'var(--text-primary)'} fontSize="12" fontWeight="bold">
              {node.id.startsWith('tx_') ? '⚙️' : node.type === 'suspect' ? '🕵️' : node.type === 'receiver' ? '🏦' : node.type === 'mixer' ? '🌪️' : '🔗'}
            </text>

            <text textAnchor="middle" y="36" fill="var(--text-primary)" fontSize="10" fontWeight="500">
              {node.label}
            </text>
            <text textAnchor="middle" y="48" fill="var(--text-muted)" fontSize="8" className="mono-addr">
              {node.details?.address ? `${node.details.address.slice(0, 6)}...${node.details.address.slice(-6)}` : node.id}
            </text>

            {showTaintHeatmap && (
              <g transform="translate(0, -28)">
                <rect
                  x="-20"
                  y="-8"
                  width="40"
                  height="14"
                  rx="3"
                  fill="#05070e"
                  stroke={taintHaloColor}
                  strokeWidth="1"
                />
                <text
                  textAnchor="middle"
                  y="2"
                  fill={taintHaloColor}
                  fontSize="8"
                  fontWeight="bold"
                >
                  {(nodeTaint * 100).toFixed(0)}%
                </text>
              </g>
            )}
          </g>
        );
      })}
    </>
  );
}
