/**
 * Taint propagation analysis for forensic fund flows
 * Proportionate taint: each hop inherits taint % weighted by value contributed.
 * For Bitcoin UTXO model, we approximate taint as: taint(out) = Σ(taint(in) * value(in)/totalIn) diluted by fee
 */

export function calculateTaintMap(nodes = [], links = [], taintedNodeIds = []) {
  const taint = new Map(); // nodeId -> 0..1
  const nodeSet = new Set(nodes.map(n => n.id));
  const seedSet = new Set(taintedNodeIds.filter(id => nodeSet.has(id)));
  // If no explicit tainted set, taint origin suspects at 100%
  if (seedSet.size === 0) {
    nodes.filter(n => n.type === 'suspect').forEach(n => seedSet.add(n.id));
  }
  seedSet.forEach(id => taint.set(id, 1.0));

  // Build adjacency with values for BFS topological propagation
  const outgoing = new Map(); // nodeId -> [{target, valueSat}]
  const incoming = new Map();
  nodes.forEach(n => { outgoing.set(n.id, []); incoming.set(n.id, []); });

  links.forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    if (!nodeSet.has(src) || !nodeSet.has(tgt)) return;
    const sats = parseSats(l.value);
    outgoing.get(src).push({ target: tgt, valueSat: sats });
    incoming.get(tgt).push({ source: src, valueSat: sats });
  });

  // Topological order (Kahn) to propagate taint; fallback BFS if cycles
  const indeg = new Map();
  nodes.forEach(n => indeg.set(n.id, (incoming.get(n.id) || []).length));
  const queue = nodes.filter(n => (indeg.get(n.id) || 0) === 0).map(n => n.id);
  const visited = new Set();
  let qi = 0;
  // Include seeds even if not sources: start from them
  seedSet.forEach(id => { if (!queue.includes(id)) queue.push(id); });

  while (qi < queue.length) {
    const u = queue[qi++];
    if (visited.has(u)) continue;
    visited.add(u);
    const taintU = taint.get(u) || 0;
    const outs = outgoing.get(u) || [];
    const totalOut = outs.reduce((s, e) => s + (e.valueSat || 0), 0) || 1;
    for (const e of outs) {
      // Proportionate: each output gets taintU * (value / totalOut), but if node already has higher taint keep max
      const propagated = taintU * (e.valueSat / totalOut);
      const existing = taint.get(e.target) || 0;
      // If multiple inputs converge, take max (conservative for forensics)
      const next = Math.max(existing, propagated, existing + propagated * 0.15);
      taint.set(e.target, Math.min(1, next));
      indeg.set(e.target, (indeg.get(e.target) || 1) - 1);
      if ((indeg.get(e.target) || 0) <= 0) queue.push(e.target);
    }
  }

  // Fallback BFS for remaining nodes (cycles)
  const remaining = nodes.filter(n => !visited.has(n.id)).map(n => n.id);
  for (const id of remaining) {
    if (!taint.has(id)) {
      const ins = incoming.get(id) || [];
      if (ins.length > 0) {
        const avg = ins.reduce((s, e) => s + (taint.get(e.source) || 0), 0) / ins.length;
        taint.set(id, Math.min(1, avg * 0.9));
      }
    }
  }

  return taint;
}

function parseSats(valueStr) {
  if (!valueStr) return 0;
  const num = parseFloat(String(valueStr).replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return 0;
  return Math.round(num * 1e8); // BTC to sats
}

export function formatTaintPct(v) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

export function taintTier(taintValue) {
  if (taintValue >= 0.75) return { label: 'HIGH TAINT', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
  if (taintValue >= 0.35) return { label: 'MEDIUM TAINT', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
  if (taintValue > 0.02) return { label: 'LOW TAINT', color: '#10b981', bg: 'rgba(16,185,129,0.12)' };
  return { label: 'UNTAINTED', color: 'var(--text-muted)', bg: 'rgba(255,255,255,0.04)' };
}
