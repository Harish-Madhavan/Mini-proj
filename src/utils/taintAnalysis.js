import { parseBtcAmount } from './forensicUtils';

/**
 * Taint propagation analysis for forensic fund flows (SIH1675 Core)
 * Models supported:
 * 1. 'proportionate' (Haircut / UTXO value dilution): downstream hops inherit taint % weighted by value contributed.
 * 2. 'fifo' (First-In, First-Out): incoming taint is assigned in chronological / link order to outgoing outputs until exhausted.
 * 3. 'poison' (Maximum / Zero-Tolerance Taint): any contact with tainted UTXO marks downstream outputs 100% tainted.
 */

export function calculateTaintMap(nodes = [], links = [], taintedNodeIds = [], model = 'proportionate') {
  const taint = new Map(); // nodeId -> 0..1
  const nodeSet = new Set(nodes.map(n => n.id));
  const seedSet = new Set(taintedNodeIds.filter(id => nodeSet.has(id)));

  // If no explicit tainted set, taint origin suspects at 100%
  if (seedSet.size === 0) {
    nodes.filter(n => n.type === 'suspect').forEach(n => seedSet.add(n.id));
  }
  // Fallback: if no suspects found, use first node
  if (seedSet.size === 0 && nodes.length > 0) {
    seedSet.add(nodes[0].id);
  }

  // Build adjacency with values. Zero-value edges (OP_RETURN data carriers,
  // "0 BTC Data" links) are unspendable and carry no taint.
  const outgoing = new Map(); // nodeId -> [{target, valueSat, linkIndex}]
  const incoming = new Map();
  nodes.forEach(n => { outgoing.set(n.id, []); incoming.set(n.id, []); });

  links.forEach((l, linkIndex) => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    if (!nodeSet.has(src) || !nodeSet.has(tgt)) return;
    const sats = parseSats(l.value);
    outgoing.get(src).push({ target: tgt, valueSat: sats, linkIndex });
    incoming.get(tgt).push({ source: src, valueSat: sats, linkIndex });
  });

  // Total *value-bearing* inflow per node. Nodes fed only by data links have
  // no economic inflow and stay untainted.
  const totalIn = new Map();
  nodes.forEach(n => {
    const sum = (incoming.get(n.id) || []).reduce((s, e) => s + Math.max(0, e.valueSat || 0), 0);
    totalIn.set(n.id, sum);
  });

  nodes.forEach(n => taint.set(n.id, seedSet.has(n.id) ? 1.0 : 0));

  // Tainted-satoshi pool held at each node (converged via fixed-point
  // iteration so both DAG fan-in and cyclic flows resolve correctly).
  const pool = new Map();
  nodes.forEach(n => pool.set(n.id, 0));

  const isPoison = model === 'poison';
  const isFifo = model === 'fifo';
  const maxPasses = Math.min(50, Math.max(10, nodes.length * 2));

  // Poison reachability flags (any tainted value-bearing contact => 100%)
  const poisoned = new Map();
  nodes.forEach(n => poisoned.set(n.id, seedSet.has(n.id)));

  for (let pass = 0; pass < maxPasses; pass++) {
    let maxDelta = 0;
    // Accumulate incoming tainted sats for this pass
    const nextPool = new Map();
    nodes.forEach(n => nextPool.set(n.id, 0));
    const nextPoisoned = new Map(poisoned);

    for (const u of nodes.map(n => n.id)) {
      const taintU = seedSet.has(u) ? 1.0 : (taint.get(u) || 0);
      if (isPoison && !poisoned.get(u)) continue;
      if (!isPoison && taintU <= 0) continue;
      const outs = (outgoing.get(u) || [])
        .filter(e => (e.valueSat || 0) > 0)
        .sort((a, b) => a.linkIndex - b.linkIndex);
      if (outs.length === 0) continue;

      if (isPoison) {
        // Poison model: any contact contaminates every value-bearing output
        for (const e of outs) nextPoisoned.set(e.target, true);
      } else if (isFifo) {
        // FIFO model: the node's tainted sats fill outputs in link order
        const totalOut = outs.reduce((s, e) => s + e.valueSat, 0);
        let available = Math.min(Math.round(totalOut * taintU), totalOut);
        for (const e of outs) {
          const give = Math.min(available, e.valueSat);
          available -= give;
          nextPool.set(e.target, nextPool.get(e.target) + give);
        }
      } else {
        // Haircut (proportionate) model: every value-bearing output inherits
        // the sender's taint *percentage* — fan-out does NOT dilute the rate.
        for (const e of outs) {
          nextPool.set(e.target, nextPool.get(e.target) + taintU * e.valueSat);
        }
      }
    }

    for (const n of nodes) {
      if (seedSet.has(n.id)) continue; // seeds are definitionally 100% tainted
      let next;
      if (isPoison) {
        next = nextPoisoned.get(n.id) ? 1.0 : 0;
        if ((next > 0) !== poisoned.get(n.id)) maxDelta = Math.max(maxDelta, 1);
        poisoned.set(n.id, nextPoisoned.get(n.id));
      } else {
        const inflow = totalIn.get(n.id) || 0;
        next = inflow > 0 ? Math.min(1, (nextPool.get(n.id) || 0) / inflow) : 0;
        const delta = Math.abs(next - (taint.get(n.id) || 0));
        if (delta > maxDelta) maxDelta = delta;
      }
      taint.set(n.id, next);
    }
    nodes.forEach(n => pool.set(n.id, nextPool.get(n.id) || 0));
    if (maxDelta < 1e-9) break;
  }

  return taint;
}

export function calculateEdgeTaintMap(nodes = [], links = [], nodeTaintMap = new Map()) {
  const edgeMap = new Map(); // `${src}->${tgt}` -> { taint, taintedSats, totalSats, color }
  links.forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    const key = `${src}->${tgt}`;
    const srcTaint = nodeTaintMap.get(src) || 0;
    const tgtTaint = nodeTaintMap.get(tgt) || 0;
    const totalSats = parseSats(l.value);
    // Unspendable data carriers move no economic value, so they carry no taint
    const edgeTaint = totalSats <= 0 ? 0 : Math.max(tgtTaint, srcTaint * 0.85);
    const taintedSats = Math.round(totalSats * edgeTaint);
    const tier = taintTier(edgeTaint);
    edgeMap.set(key, {
      taint: edgeTaint,
      taintedSats,
      totalSats,
      tier: tier.label,
      color: tier.color,
      valueBtc: l.value
    });
  });
  return edgeMap;
}

export function generateTaintLedger(nodes = [], links = [], taintMap = new Map()) {
  return nodes.map((node, index) => {
    const taintVal = taintMap.get(node.id) || 0;
    const tier = taintTier(taintVal);
    const sats = parseSats(node.balance);
    const taintedSats = Math.round(sats * taintVal);
    return {
      index: index + 1,
      nodeId: node.id,
      label: node.label || node.id,
      type: node.type || 'hop',
      address: node.details?.address || node.id,
      balance: node.balance || '0 BTC',
      taintPct: formatTaintPct(taintVal),
      taintValue: taintVal,
      taintedSats,
      cleanSats: sats - taintedSats,
      tier
    };
  });
}

export function parseSats(valueStr) {
  if (!valueStr) return 0;
  return Math.round(parseBtcAmount(valueStr) * 1e8); // BTC to sats
}

export function formatTaintPct(v) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

export function taintTier(taintValue) {
  if (taintValue >= 0.75) return { label: 'High', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
  if (taintValue >= 0.35) return { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
  if (taintValue > 0.02) return { label: 'Low', color: '#10b981', bg: 'rgba(16,185,129,0.12)' };
  return { label: 'Clean', color: '#94a3b8', bg: 'rgba(255,255,255,0.04)' };
}
