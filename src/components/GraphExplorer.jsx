import React, { useState, useEffect } from 'react';
import GraphCanvas from './graph/GraphCanvas';
import MetadataSidebar from './graph/MetadataSidebar';
import { useCase } from '../hooks/useCase';

export default function GraphExplorer() {
  const { activeCase, setActiveTab, handleExpandAddress, isLoadingLive } = useCase();

  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightReceiver, setHighlightReceiver] = useState(false);
  
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
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem', minHeight: '500px' }}>
      <GraphCanvas
        activeCase={activeCase}
        selectedNode={selectedNode}
        highlightReceiver={highlightReceiver}
        setHighlightReceiver={setHighlightReceiver}
        zoom={zoom}
        setZoom={setZoom}
        panOffset={panOffset}
        setPanOffset={setPanOffset}
        isPanning={isPanning}
        setIsPanning={setIsPanning}
        panStart={panStart}
        setPanStart={setPanStart}
        customPositions={customPositions}
        setCustomPositions={setCustomPositions}
        draggingNodeId={draggingNodeId}
        setDraggingNodeId={setDraggingNodeId}
        dragStart={dragStart}
        setDragStart={setDragStart}
        searchFilter={searchFilter}
        setSearchFilter={setSearchFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        getNodeCoords={getNodeCoords}
        isLoadingLive={isLoadingLive}
        onSelectNode={setSelectedNode}
        onSelectTab={setActiveTab}
      />
      <MetadataSidebar
        selectedNode={selectedNode}
        onSelectTab={setActiveTab}
        onExpandAddress={handleExpandAddress}
      />
    </div>
  );
}
