/**
 * AegisTrace Graph Intelligence & Forensic Pathfinding Algorithms (SIH1675 Core)
 * 1. Sugiyama-style Layered DAG Layout with topological rank assignment (Kahn's algorithm)
 * 2. Critical Money Trail — Longest-path in DAG (DP) + Max-Heap Dijkstra fallback for cyclic graphs
 * 3. Circular flow detection — iterative DFS with path compression
 * 4. Centrality with normalized throughput
 */

// Simple max-heap for critical trail (binary heap, O(log n) push/pop)
class MaxHeap {
  constructor() { this.heap = []; }
  push(item) {
    this.heap.push(item);
    this._siftUp(this.heap.length - 1);
  }
  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) { this.heap[0] = last; this._siftDown(0); }
    return top;
  }
  isEmpty() { return this.heap.length === 0; }
  _siftUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heap[p].cost >= this.heap[i].cost) break;
      [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]];
      i = p;
    }
  }
  _siftDown(i) {
    const n = this.heap.length;
    while (true) {
      let largest = i;
      const l = i * 2 + 1, r = i * 2 + 2;
      if (l < n && this.heap[l].cost > this.heap[largest].cost) largest = l;
      if (r < n && this.heap[r].cost > this.heap[largest].cost) largest = r;
      if (largest === i) break;
      [this.heap[i], this.heap[largest]] = [this.heap[largest], this.heap[i]];
      i = largest;
    }
  }
}

/**
 * Compute layered coordinates using topological rank (longest path depth) instead of static 4 buckets.
 * Handles arbitrary depth (e.g. 6+ hop peel chains) by assigning each node its max distance from any source.
 */
export function computeLayeredGraphLayout(nodes = [], links = [], bounds = { width: 800, height: 360 }) {
  if (!nodes || nodes.length === 0) return {};

  const { width, height } = bounds;
  const paddingX = 80;
  const paddingY = 40;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  const centerY = height / 2;

  // Build graph
  const inDegree = new Map();
  const outAdj = new Map();
  const nodeSet = new Set(nodes.map(n => n.id));
  nodes.forEach(n => { inDegree.set(n.id, 0); outAdj.set(n.id, []); });
  links.forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    if (nodeSet.has(src) && nodeSet.has(tgt)) {
      outAdj.get(src).push(tgt);
      inDegree.set(tgt, (inDegree.get(tgt) || 0) + 1);
    }
  });

  // Kahn's topological order to compute rank (longest distance from source)
  const rank = new Map();
  nodes.forEach(n => rank.set(n.id, 0));
  const queue = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);
  const topo = [];
  const indegCopy = new Map(inDegree);
  // Use queue as FIFO
  let qIdx = 0;
  while (qIdx < queue.length) {
    const u = queue[qIdx++];
    topo.push(u);
    for (const v of outAdj.get(u) || []) {
      const newRank = (rank.get(u) || 0) + 1;
      if (newRank > (rank.get(v) || 0)) rank.set(v, newRank);
      indegCopy.set(v, indegCopy.get(v) - 1);
      if (indegCopy.get(v) === 0) queue.push(v);
    }
  }
  // If cycles prevented full topo, fall back to type-based rank for remaining nodes
  if (topo.length < nodes.length) {
    const topoSet = new Set(topo);
    const unranked = nodes.filter(n => !topoSet.has(n.id));
    // Place unranked past the ranked layers, bucketed by type so receivers
    // stay rightmost and tx/mixer hubs sit one layer before them
    const maxRank = Math.max(0, ...Array.from(rank.values()));
    unranked.forEach(n => {
      if (n.type === 'receiver') rank.set(n.id, maxRank + 2);
      else if (n.type === 'mixer' || n.id.startsWith('tx_')) rank.set(n.id, maxRank + 1);
      else rank.set(n.id, maxRank + 1);
    });
  }

  // Group by rank
  const rankGroups = new Map();
  nodes.forEach(n => {
    const r = rank.get(n.id) || 0;
    if (!rankGroups.has(r)) rankGroups.set(r, []);
    rankGroups.get(r).push(n);
  });
  const sortedRanks = Array.from(rankGroups.keys()).sort((a, b) => a - b);
  const layerCount = sortedRanks.length || 1;
  const layerSpacingX = layerCount > 1 ? usableWidth / (layerCount - 1) : usableWidth;

  const positions = {};
  sortedRanks.forEach((r, layerIdx) => {
    const layerNodes = rankGroups.get(r);
    const x = paddingX + layerIdx * layerSpacingX;
    const count = layerNodes.length;
    if (count === 1) {
      const y = layerNodes[0].type === 'mixer' ? centerY + 40 : centerY;
      positions[layerNodes[0].id] = { x: Math.round(x), y: Math.round(y) };
    } else {
      // Stagger Y to avoid overlap; sort by type for visual consistency
      layerNodes.sort((a, b) => (a.type || '').localeCompare(b.type || ''));
      const stepY = usableHeight / (count + 1);
      layerNodes.forEach((node, idx) => {
        const y = paddingY + (idx + 1) * stepY;
        positions[node.id] = { x: Math.round(x), y: Math.round(y) };
      });
    }
  });

  return positions;
}

/**
 * Find critical money trail — longest value path from source to sink.
 * Uses DP on DAG when graph is acyclic (O(V+E)), else Max-Heap search.
 */
function parseLinkValue(value) {
  return parseFloat(String(value || '0').replace(/[^0-9.]/g, '')) || 0;
}

export function findCriticalMoneyTrail(nodes = [], links = [], startNodeId = null, endNodeId = null) {
  if (!nodes.length || !links.length) return { path: [], totalValue: 0, linkIndices: [] };

  // Default endpoints: highest-outflow source and highest-inflow sink, so the
  // trail follows the dominant money flow rather than whichever node the
  // formatter happened to emit first.
  const outflow = new Map();
  const inflow = new Map();
  links.forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    const v = parseLinkValue(l.value);
    outflow.set(src, (outflow.get(src) || 0) + v);
    inflow.set(tgt, (inflow.get(tgt) || 0) + v);
  });
  const pickMax = (candidates, volumes, fallbackId) => {
    let best = null;
    let bestVol = -1;
    for (const n of candidates) {
      const v = volumes.get(n.id) || 0;
      if (v > bestVol) { bestVol = v; best = n.id; }
    }
    return best || fallbackId;
  };

  const start = startNodeId
    || pickMax(nodes.filter(n => n.type === 'suspect' || n.id.startsWith('in_')), outflow, nodes[0].id);
  const end = endNodeId
    || pickMax(nodes.filter(n => n.type === 'receiver' || n.id.startsWith('out_')), inflow, nodes[nodes.length - 1].id);

  const idSet = new Set(nodes.map(n => n.id));
  const adj = new Map();
  const inDegree = new Map();
  nodes.forEach(n => { adj.set(n.id, []); inDegree.set(n.id, 0); });
  const linkIndexMap = new Map(); // `${src}->${tgt}` -> idx (first)
  links.forEach((l, idx) => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    if (!idSet.has(src) || !idSet.has(tgt)) return;
    const numericVal = parseFloat(String(l.value || '0').replace(/[^0-9.]/g, '')) || 0;
    adj.get(src).push({ target: tgt, value: numericVal, linkIndex: idx });
    inDegree.set(tgt, (inDegree.get(tgt) || 0) + 1);
    const key = `${src}->${tgt}`;
    if (!linkIndexMap.has(key)) linkIndexMap.set(key, idx);
  });

  // Try DAG longest path (topological DP) — Bitcoin graphs are DAGs
  const topo = [];
  const queue = [];
  const indeg = new Map(inDegree);
  nodes.forEach(n => { if ((indeg.get(n.id) || 0) === 0) queue.push(n.id); });
  let qi = 0;
  while (qi < queue.length) {
    const u = queue[qi++];
    topo.push(u);
    for (const e of adj.get(u) || []) {
      indeg.set(e.target, indeg.get(e.target) - 1);
      if (indeg.get(e.target) === 0) queue.push(e.target);
    }
  }

  if (topo.length === nodes.length) {
    // DAG DP
    const dist = new Map();
    const prev = new Map();
    const prevLink = new Map();
    nodes.forEach(n => dist.set(n.id, -Infinity));
    dist.set(start, 0);
    // Process in topo order, but only from reachable nodes
    for (const u of topo) {
      const d = dist.get(u);
      if (d === -Infinity) continue;
      for (const e of adj.get(u) || []) {
        const nd = d + e.value;
        if (nd > (dist.get(e.target) ?? -Infinity)) {
          dist.set(e.target, nd);
          prev.set(e.target, u);
          prevLink.set(e.target, e.linkIndex);
        }
      }
    }
    if (dist.get(end) !== -Infinity) {
      // Reconstruct
      const path = [];
      const linkIndices = [];
      let cur = end;
      while (cur) {
        path.push(cur);
        const pl = prevLink.get(cur);
        if (pl !== undefined) linkIndices.push(pl);
        cur = prev.get(cur);
        if (cur === start && !path.includes(cur)) { path.push(cur); break; }
        if (path.length > nodes.length + 5) break; // safety
      }
      path.reverse(); linkIndices.reverse();
      return { path, totalValue: dist.get(end), linkIndices };
    }
    // No path in DAG -> fall through to heap search for best reachable
  }

  // Fallback: Max-heap best-first search (allows revisiting if better cost)
  const heap = new MaxHeap();
  heap.push({ id: start, cost: 0, path: [start], linksUsed: [] });
  const bestCost = new Map(); // node -> best cost seen
  let bestPath = null;

  while (!heap.isEmpty()) {
    const cur = heap.pop();
    if ((bestCost.get(cur.id) ?? -Infinity) > cur.cost) continue;
    bestCost.set(cur.id, cur.cost);
    if (cur.id === end) { bestPath = cur; break; }
    for (const edge of adj.get(cur.id) || []) {
      const nextCost = cur.cost + edge.value;
      if (nextCost <= (bestCost.get(edge.target) ?? -Infinity)) continue;
      // Simple cycle guard: path length limit
      if (cur.path.includes(edge.target)) continue;
      heap.push({ id: edge.target, cost: nextCost, path: [...cur.path, edge.target], linksUsed: [...cur.linksUsed, edge.linkIndex] });
    }
  }

  return {
    path: bestPath ? bestPath.path : (start === end ? [start] : []),
    totalValue: bestPath ? bestPath.cost : 0,
    linkIndices: bestPath ? bestPath.linksUsed : []
  };
}

/**
 * Detect circular flows — iterative DFS to avoid recursion depth issues, O(V+E)
 */
export function detectCircularFlows(nodes = [], links = []) {
  const adj = new Map();
  nodes.forEach(n => adj.set(n.id, []));
  links.forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    if (adj.has(src)) adj.get(src).push(tgt);
  });

  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();
  const pathStack = []; // current path
  const pathIndex = new Map(); // node -> index in pathStack

  function iterativeDfs(start) {
    const stack = [{ node: start, idx: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const nodeId = frame.node;
      if (!visited.has(nodeId)) {
        visited.add(nodeId);
        recursionStack.add(nodeId);
        pathIndex.set(nodeId, pathStack.length);
        pathStack.push(nodeId);
      }
      const neighbors = adj.get(nodeId) || [];
      if (frame.idx < neighbors.length) {
        const neighbor = neighbors[frame.idx++];
        if (!visited.has(neighbor)) {
          stack.push({ node: neighbor, idx: 0 });
        } else if (recursionStack.has(neighbor)) {
          const startIdx = pathIndex.get(neighbor);
          if (startIdx !== undefined) {
            const cycle = pathStack.slice(startIdx);
            cycle.push(neighbor);
            cycles.push(cycle);
          }
        }
      } else {
        recursionStack.delete(nodeId);
        pathIndex.delete(nodeId);
        pathStack.pop();
        stack.pop();
      }
    }
  }

  nodes.forEach(n => { if (!visited.has(n.id)) iterativeDfs(n.id); });
  return cycles;
}

/**
 * Compute centrality with normalized throughput (percent of total flow)
 */
export function computeNodeCentralityMetrics(nodes = [], links = []) {
  const metrics = {};
  nodes.forEach(n => {
    metrics[n.id] = { inDegree: 0, outDegree: 0, totalDegree: 0, inBtc: 0, outBtc: 0, throughputBtc: 0, throughputShare: 0, isHub: false };
  });
  let totalVolume = 0;
  links.forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    const val = parseLinkValue(l.value);
    totalVolume += val;
    if (metrics[src]) { metrics[src].outDegree++; metrics[src].totalDegree++; metrics[src].outBtc += val; }
    if (metrics[tgt]) { metrics[tgt].inDegree++; metrics[tgt].totalDegree++; metrics[tgt].inBtc += val; }
  });
  Object.keys(metrics).forEach(id => {
    const m = metrics[id];
    m.inBtc = parseFloat(m.inBtc.toFixed(4));
    m.outBtc = parseFloat(m.outBtc.toFixed(4));
    // Throughput counts both directions, so normalize against 2x total volume
    // — otherwise per-node shares sum to ~200% and every mid-chain hop looks
    // like a dominant hub.
    m.throughputBtc = parseFloat((m.inBtc + m.outBtc).toFixed(4));
    m.throughputShare = totalVolume > 0 ? parseFloat((m.throughputBtc / (2 * totalVolume)).toFixed(3)) : 0;
    m.isHub = m.totalDegree >= 3 || (m.inDegree >= 2 && m.outDegree >= 1) || m.throughputShare > 0.3;
  });
  return metrics;
}
