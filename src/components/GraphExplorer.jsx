import React, { useState, useEffect, useMemo } from 'react';
import GraphCanvas from './graph/GraphCanvas';
import MetadataSidebar from './graph/MetadataSidebar';
import TransactionTimeline from './graph/TransactionTimeline';
import { useCase } from '../hooks/useCase';

import { computeLayeredGraphLayout, collapseGraphClusters } from '../utils/graphAlgorithms';

export default function GraphExplorer() {
  const { 
    activeCase, 
    setActiveTab, 
    handleExpandAddress, 
    isLoadingLive, 
    handleAddCaseNote, 
    handleDeleteCaseNote 
  } = useCase();

  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightReceiver, setHighlightReceiver] = useState(false);
  const [isolatedNodeId, setIsolatedNodeId] = useState(null);
  const [isClusterCollapsed, setIsClusterCollapsed] = useState(false);
  
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

  // Interactive Flow Step-through Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackStep, setPlaybackStep] = useState(null);

  useEffect(() => {
    if (activeCase && activeCase.nodes.length > 0) {
      setSelectedNode(activeCase.nodes[0]);
    }
    setHighlightReceiver(false);
    setIsolatedNodeId(null);
    setCustomPositions({});
    setSearchFilter('');
    setTypeFilter('all');
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
    setIsPlaying(false);
    setPlaybackStep(null);
  }, [activeCase]);

  // Compute cluster-collapsed or full graph
  const { displayNodes, displayLinks } = useMemo(() => {
    if (!activeCase?.nodes?.length) return { displayNodes: [], displayLinks: [] };
    if (!isClusterCollapsed) {
      return { displayNodes: activeCase.nodes, displayLinks: activeCase.links || [] };
    }
    const result = collapseGraphClusters(activeCase.nodes, activeCase.links || [], { minClusterSize: 3, collapseAll: true });
    return {
      displayNodes: result.nodes,
      displayLinks: result.links
    };
  }, [activeCase, isClusterCollapsed]);

  // If active selection was condensed into a cluster, select parent cluster
  useEffect(() => {
    if (isClusterCollapsed && selectedNode) {
      const exists = displayNodes.some(n => n.id === selectedNode.id);
      if (!exists) {
        const parentCluster = displayNodes.find(n => n.isCollapsedCluster && n.subNodeIds?.includes(selectedNode.id));
        if (parentCluster) {
          setSelectedNode(parentCluster);
        }
      }
    }
  }, [isClusterCollapsed, displayNodes, selectedNode]);

  // Flow Playback Timer
  useEffect(() => {
    if (!isPlaying || !displayLinks.length) return;

    const interval = setInterval(() => {
      setPlaybackStep(prev => {
        const next = prev === null ? 0 : prev + 1;
        if (next >= displayLinks.length) {
          setIsPlaying(false);
          return null;
        }
        return next;
      });
    }, 1400);

    return () => clearInterval(interval);
  }, [isPlaying, displayLinks]);

  if (!activeCase) return <div style={{ color: 'var(--text-secondary)' }}>No case selected.</div>;

  // Precompute layered layout
  const computedLayout = computeLayeredGraphLayout(displayNodes, displayLinks);

  // Dynamic layout generator with custom drag coordinates support
  const getNodeCoords = (nodeId) => {
    if (customPositions[nodeId]) {
      return customPositions[nodeId];
    }
    if (computedLayout[nodeId]) {
      return computedLayout[nodeId];
    }
    return { x: 380, y: 180 };
  };

  const effectiveCase = {
    ...activeCase,
    nodes: displayNodes,
    links: displayLinks
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="responsive-split-grid" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '2rem', minHeight: '540px' }}>
        <GraphCanvas
          activeCase={effectiveCase}
          selectedNode={selectedNode}
          highlightReceiver={highlightReceiver}
          setHighlightReceiver={setHighlightReceiver}
          isolatedNodeId={isolatedNodeId}
          setIsolatedNodeId={setIsolatedNodeId}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          playbackStep={playbackStep}
          setPlaybackStep={setPlaybackStep}
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
          isClusterCollapsed={isClusterCollapsed}
          setIsClusterCollapsed={setIsClusterCollapsed}
        />
        <MetadataSidebar
          selectedNode={selectedNode}
          activeCase={effectiveCase}
          isolatedNodeId={isolatedNodeId}
          onToggleIsolate={(nodeId) => setIsolatedNodeId(prev => prev === nodeId ? null : nodeId)}
          onSelectTab={setActiveTab}
          onExpandAddress={handleExpandAddress}
          onAddNote={handleAddCaseNote}
          onDeleteNote={handleDeleteCaseNote}
          setIsClusterCollapsed={setIsClusterCollapsed}
          onSelectNode={setSelectedNode}
        />
      </div>
      <TransactionTimeline activeCase={effectiveCase} />
    </div>
  );
}
