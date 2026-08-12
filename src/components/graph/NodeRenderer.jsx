import React from 'react';

export default function NodeRenderer({
  nodes,
  links,
  getNodeCoords,
  selectedNode,
  highlightReceiver,
  searchFilter,
  typeFilter,
  draggingNodeId,
  onNodeMouseDown,
  onSelectNode
}) {
  return (
    <>
      {/* Render Links */}
      {links.map((link, i) => {
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
      {nodes.map((node) => {
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
            aria-label={`Select ${node.type} node ${node.entityName} address ${node.details.address}`}
            transform={`translate(${coords.x}, ${coords.y})`}
            onMouseDown={(e) => onNodeMouseDown(node.id, e)}
            onClick={() => onSelectNode(node)}
            onKeyDown={handleKeyDown}
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
    </>
  );
}
