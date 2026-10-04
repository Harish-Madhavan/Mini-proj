import React from 'react';
import { taintTier } from '../../utils/taintAnalysis';
import { identifyBridgeEntity } from '../../utils/crossChainForensics';

// Minimal node palette — muted dots, no emoji, no heavy fills.
const TYPE_COLORS = {
  suspect: '#f87171',
  mixer: '#c084fc',
  receiver: '#34d399',
  bridge: '#22d3ee',
  cluster: '#38bdf8',
  lightning: '#facc15',
  hop: '#8b8b93',
  tx: '#52525b',
};

function nodeColor(node, isBridge, isCluster, isLightning) {
  if (isCluster) return TYPE_COLORS.cluster;
  if (isLightning) return TYPE_COLORS.lightning;
  if (isBridge) return TYPE_COLORS.bridge;
  if (node.id.startsWith('tx_')) return TYPE_COLORS.tx;
  return TYPE_COLORS[node.type] || TYPE_COLORS.hop;
}

function shortLabel(node) {
  const label = node.label || node.entityName || node.id;
  return label.length > 14 ? `${label.slice(0, 13)}…` : label;
}

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
      {/* Links — thin, quiet; value shown only for highlighted edges */}
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
        const taintColor = edgeTaint ? edgeTaint.color : '#3f3f46';

        const isDimmed = (isolatedNodeId && !isIsolatedLink) ||
                         (playbackStep !== null && i > playbackStep) ||
                         (criticalTrail && !isCriticalLink && !isolatedNodeId);

        const isHighlighted = isSelectedLink || isPlaybackActive || isPlaybackPast || isCriticalLink;
        const showValue = isCriticalLink || isPlaybackActive || (showTaintHeatmap && taintVal > 0.35);

        // Gentle curve to separate parallel flows without visual noise
        const mx = (startCoords.x + endCoords.x) / 2;
        const my = (startCoords.y + endCoords.y) / 2;
        const dx = endCoords.x - startCoords.x;
        const dy = endCoords.y - startCoords.y;
        const len = Math.hypot(dx, dy) || 1;
        const bow = Math.min(14, len * 0.08) * ((i % 2 === 0) ? 1 : -1);
        const cx = mx - (dy / len) * bow * 0.3;
        const cy = my + (dx / len) * bow * 0.3;
        const d = `M ${startCoords.x} ${startCoords.y} Q ${cx} ${cy} ${endCoords.x} ${endCoords.y}`;

        let linkStroke = '#2b2b31';
        let linkWidth = 1;
        if (showTaintHeatmap && edgeTaint && taintVal > 0.02) {
          linkStroke = taintColor;
          linkWidth = taintVal >= 0.75 ? 2 : 1.5;
        } else if (isCriticalLink) {
          linkStroke = '#7dd3fc';
          linkWidth = 2;
        } else if (isPlaybackActive) {
          linkStroke = '#e4e4e7';
          linkWidth = 2;
        } else if (isHighlighted) {
          linkStroke = '#52525b';
          linkWidth = 1.5;
        }

        return (
          <g key={i} style={{ opacity: isDimmed ? 0.1 : 1, transition: 'opacity 0.25s ease' }}>
            <title>{`Step ${i + 1}: ${link.value} (${link.timestamp || 'on chain'})\n${src} → ${tgt}${showTaintHeatmap && edgeTaint ? `\nTraced: ${(taintVal * 100).toFixed(1)}%` : ''}${isCriticalLink ? '\n[main trail]' : ''}`}</title>
            {/* Wide invisible hit path for easier hover */}
            <path d={d} stroke="transparent" strokeWidth={12} fill="none" />
            <path
              d={d}
              stroke={linkStroke}
              strokeWidth={linkWidth}
              fill="none"
              opacity={isHighlighted || (showTaintHeatmap && taintVal > 0.1) ? 0.9 : 0.55}
              strokeLinecap="round"
            />
            {showValue && (
              <text
                x={cx}
                y={cy - 5}
                textAnchor="middle"
                fill={showTaintHeatmap && taintVal > 0.02 ? taintColor : 'var(--text-secondary)'}
                fontSize="8.5"
                fontWeight="500"
              >
                {showTaintHeatmap && taintVal > 0.02 ? `${link.value} · ${Math.round(taintVal * 100)}%` : link.value}
              </text>
            )}
            {/* Direction dot near target */}
            <circle
              cx={endCoords.x - (dx / len) * 12}
              cy={endCoords.y - (dy / len) * 12}
              r={isHighlighted ? 2.2 : 1.6}
              fill={linkStroke}
              opacity={0.8}
            />
          </g>
        );
      })}

      {/* Nodes — small dots with single muted label */}
      {nodes.map((node) => {
        const coords = getNodeCoords(node.id);
        const isSelected = selectedNode && selectedNode.id === node.id;
        const isIsolatedNode = isolatedNodeId ? isolatedConnectedNodeIds.has(node.id) : true;
        const isCriticalNode = criticalTrail && criticalNodeSet.has(node.id);

        const isBridge = node.type === 'bridge' || Boolean(node.details?.crossChain) || Boolean(identifyBridgeEntity(node));
        const isCluster = Boolean(node.isCollapsedCluster || node.type === 'cluster');
        const isLightning = Boolean(
          node.details?.lightningInfo || 
          node.type === 'lightning_channel' || 
          node.isLightning || 
          node.details?.scriptStandard === 'HTLC'
        );

        const query = (searchFilter || '').trim().toLowerCase();
        const matchesSearch = !query ||
          (node.label || '').toLowerCase().includes(query) ||
          (node.details?.address || '').toLowerCase().includes(query) ||
          (node.entityName || '').toLowerCase().includes(query);

        const matchesType = typeFilter === 'all' ||
          (typeFilter === 'bridge' ? isBridge : typeFilter === 'cluster' ? isCluster : node.type === typeFilter);
        const isDimmed = !matchesSearch || !matchesType || !isIsolatedNode || (criticalTrail && !isCriticalNode && !isolatedNodeId);

        const color = nodeColor(node, isBridge, isCluster, isLightning);
        const nodeTaint = taintMap.get(node.id) ?? 0;
        const taintColor = taintTier(nodeTaint).color;
        const ringColor = showTaintHeatmap && nodeTaint > 0.02 ? taintColor : null;

        const isReceiverHighlight = highlightReceiver && node.type === 'receiver';
        const isTxHub = node.id.startsWith('tx_');
        const r = node.type === 'suspect' ? 7 : isTxHub ? 5 : 6;

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
            aria-label={`Select ${node.type} node ${node.entityName || node.label || node.id}`}
            transform={`translate(${coords.x}, ${coords.y})`}
            onMouseDown={(e) => onNodeMouseDown(node.id, e)}
            onClick={() => onSelectNode(node)}
            onKeyDown={handleKeyDown}
            style={{
              cursor: draggingNodeId === node.id ? 'grabbing' : 'grab',
              opacity: isDimmed ? 0.15 : 1,
              transition: 'opacity 0.25s ease'
            }}
          >
            <title>{`${isLightning ? '[⚡ Lightning/HTLC] ' : ''}${isCluster ? `[☷ Cluster (${node.details?.addressCount || node.subNodes?.length || '10+'})] ` : ''}${node.label || node.id}\n${node.type}${node.details?.address ? `\n${node.details.address}` : ''}${node.balance ? `\n${node.balance}` : ''}${showTaintHeatmap ? `\nTraced: ${(nodeTaint * 100).toFixed(1)}%` : ''}`}</title>
            
            {/* Cluster node rendering: rounded pill with input count */}
            {isCluster ? (
              <g>
                {(isSelected || ringColor) && (
                  <rect
                    x={-28}
                    y={-13}
                    width={56}
                    height={26}
                    rx={13}
                    fill="none"
                    stroke={ringColor || '#38bdf8'}
                    strokeWidth={1.5}
                    opacity={0.65}
                  />
                )}
                <rect
                  x={-24}
                  y={-11}
                  width={48}
                  height={22}
                  rx={11}
                  fill="rgba(56, 189, 248, 0.18)"
                  stroke={isSelected ? '#fafafa' : '#38bdf8'}
                  strokeWidth={isSelected ? 1.5 : 1.2}
                />
                <text textAnchor="middle" y={3.5} fill="#38bdf8" fontSize="8.5" fontWeight="700">
                  ☷ {node.details?.addressCount || node.subNodes?.length || '10+'}
                </text>
              </g>
            ) : (
              <>
                {(isSelected || isCriticalNode || isReceiverHighlight) && (
                  <circle r={r + 5} fill="none" stroke={ringColor || color} strokeWidth={1.25} opacity={0.55} />
                )}
                {ringColor && !isSelected && (
                  <circle r={r + 3} fill="none" stroke={ringColor} strokeWidth={1} opacity={0.5} />
                )}
                <circle
                  r={r}
                  fill={isTxHub ? '#18181b' : color}
                  stroke={isTxHub ? color : isSelected ? '#fafafa' : 'rgba(0,0,0,0.45)'}
                  strokeWidth={isSelected ? 1.5 : 1}
                  opacity={isTxHub ? 1 : 0.92}
                />
                {isTxHub && <circle r={1.6} fill={color} opacity={0.9} />}
              </>
            )}

            {/* Lightning icon indicator */}
            {isLightning && (
              <text textAnchor="middle" y={-(r + 5)} fill="#facc15" fontSize="10" fontWeight="700">
                ⚡
              </text>
            )}

            <text textAnchor="middle" y={isCluster ? 22 : r + 13} fill={isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'} fontSize="8.5" fontWeight={isSelected ? 600 : 500}>
              {shortLabel(node)}
            </text>
            {showTaintHeatmap && nodeTaint > 0.35 && (
              <text textAnchor="middle" y={isCluster ? -18 : -(r + 6)} fill={taintColor} fontSize="8" fontWeight={600}>
                {Math.round(nodeTaint * 100)}%
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}
