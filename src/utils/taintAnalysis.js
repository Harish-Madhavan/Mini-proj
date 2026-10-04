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
        // FIFO model: the node's tainted *holdings* fill outputs in link
        // order. Holdings are conserved: inflow × taint%. Seeds have no
        // meaningful inflow — their outputs are definitionally 100% tainted.
        const totalOut = outs.reduce((s, e) => s + e.valueSat, 0);
        const isSeed = seedSet.has(u);
        const holdings = isSeed
          ? totalOut
          : Math.round((totalIn.get(u) || 0) * taintU);
        let available = Math.min(holdings, totalOut);
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
    if (maxDelta < 1e-9) break;
  }

  return taint;
}

export function calculateEdgeTaintMap(nodes = [], links = [], nodeTaintMap = new Map(), model = 'proportionate') {
  // Edge taint = tainted fraction of the value *carried by that edge*,
  // derived from the sender — never from the receiver. Using the target's
  // taint (max(src, tgt)) misattributes clean inputs on fan-in and breaks
  // reconciliation with the node map / ledger.
  //
  // - proportionate / poison: every value-bearing output inherits the
  //   sender's taint % (poison node values are already 0/1, so srcTaint
  //   alone is sufficient — no decay factor).
  // - fifo: the sender's conserved holdings (inflow × taint%; seeds emit
  //   fully tainted) fill outputs in link order; each edge gets
  //   give / edgeValue.
  // Parallel edges between the same pair are aggregated so the `${src}->${tgt}`
  // lookup used by the graph renderer stays stable.
  const nodeSet = new Set((nodes || []).map(n => n.id));
  const suspectSet = new Set(
    (nodes || []).filter(n => n.type === 'suspect').map(n => n.id)
  );

  const totalIn = new Map();
  nodes.forEach(n => totalIn.set(n.id, 0));
  links.forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    if (!nodeSet.has(src) || !nodeSet.has(tgt)) return;
    const sats = parseSats(l.value);
    if (sats > 0) totalIn.set(tgt, (totalIn.get(tgt) || 0) + sats);
  });

  const isSeedLike = (id, taintVal) =>
    suspectSet.has(id) || ((totalIn.get(id) || 0) === 0 && taintVal > 0);

  // FIFO allocation per sender:edge -> tainted sats given to that edge.
  const fifoGive = new Map(); // linkIndex -> sats
  if (model === 'fifo') {
    const bySource = new Map();
    links.forEach((l, linkIndex) => {
      const src = typeof l.source === 'object' ? l.source.id : l.source;
      const tgt = typeof l.target === 'object' ? l.target.id : l.target;
      if (!nodeSet.has(src) || !nodeSet.has(tgt)) return;
      const sats = parseSats(l.value);
      if (sats <= 0) {
        fifoGive.set(linkIndex, 0);
        return;
      }
      if (!bySource.has(src)) bySource.set(src, []);
      bySource.get(src).push({ linkIndex, sats });
    });
    for (const [src, outs] of bySource) {
      outs.sort((a, b) => a.linkIndex - b.linkIndex);
      const totalOut = outs.reduce((s, e) => s + e.sats, 0);
      const srcTaint = Math.min(1, Math.max(0, nodeTaintMap.get(src) || 0));
      const holdings = isSeedLike(src, srcTaint)
        ? totalOut
        : Math.round((totalIn.get(src) || 0) * srcTaint);
      let available = Math.min(holdings, totalOut);
      for (const e of outs) {
        const give = Math.min(available, e.sats);
        available -= give;
        fifoGive.set(e.linkIndex, give);
      }
    }
  }

  const edgeMap = new Map(); // `${src}->${tgt}` -> { taint, taintedSats, totalSats, color }
  const aggregate = new Map(); // pair key -> { taintedSats, totalSats, valueBtc }
  links.forEach((l, linkIndex) => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    if (!nodeSet.has(src) || !nodeSet.has(tgt)) return;
    const key = `${src}->${tgt}`;
    const totalSats = parseSats(l.value);
    let edgeTaint = 0;
    let taintedSats = 0;
    if (totalSats > 0) {
      if (model === 'fifo') {
        const give = fifoGive.get(linkIndex) || 0;
        taintedSats = give;
        edgeTaint = totalSats > 0 ? Math.min(1, give / totalSats) : 0;
      } else {
        // Unspendable data carriers move no economic value, so no taint.
        // Seeds with no map entry default to 0 only when the node is unknown;
        // known seeds resolve via nodeTaintMap (≈1).
        const srcTaint = Math.min(1, Math.max(0, nodeTaintMap.get(src) || 0));
        edgeTaint = srcTaint;
        taintedSats = Math.round(totalSats * edgeTaint);
      }
    }
    const prev = aggregate.get(key);
    if (prev) {
      prev.taintedSats += taintedSats;
      prev.totalSats += totalSats;
    } else {
      aggregate.set(key, { taintedSats, totalSats, valueBtc: l.value });
    }
  });

  for (const [key, agg] of aggregate) {
    const taint = agg.totalSats > 0 ? Math.min(1, agg.taintedSats / agg.totalSats) : 0;
    const tier = taintTier(taint);
    edgeMap.set(key, {
      taint,
      taintedSats: agg.taintedSats,
      totalSats: agg.totalSats,
      tier: tier.label,
      color: tier.color,
      valueBtc: agg.valueBtc
    });
  }
  return edgeMap;
}

export function generateTaintLedger(nodes = [], links = [], taintMap = new Map()) {
  // Node taint % is defined by value-bearing inflow (sum of incoming edge
  // taint / total inflow). The displayed balance can differ from inflow
  // (fees, change, synthetic data), so expose both: taintedSats stays
  // balance-based for the existing UI, while inflow fields let auditors
  // reconcile node taint against the edge map.
  const nodeSet = new Set((nodes || []).map(n => n.id));
  const inflowSats = new Map();
  const outflowSats = new Map();
  nodes.forEach(n => { inflowSats.set(n.id, 0); outflowSats.set(n.id, 0); });
  (links || []).forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    if (!nodeSet.has(src) || !nodeSet.has(tgt)) return;
    const sats = parseSats(l.value);
    if (sats <= 0) return;
    inflowSats.set(tgt, (inflowSats.get(tgt) || 0) + sats);
    outflowSats.set(src, (outflowSats.get(src) || 0) + sats);
  });

  return nodes.map((node, index) => {
    const taintVal = Math.min(1, Math.max(0, taintMap.get(node.id) || 0));
    const tier = taintTier(taintVal);
    const sats = parseSats(node.balance);
    const inflow = inflowSats.get(node.id) || 0;
    const taintedSats = Math.max(0, Math.min(sats, Math.round(sats * taintVal)));
    const taintedInflowSats = Math.round(inflow * taintVal);
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
      cleanSats: Math.max(0, sats - taintedSats),
      inflowSats: inflow,
      outflowSats: outflowSats.get(node.id) || 0,
      taintedInflowSats,
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

export const TAINT_MODELS = ['proportionate', 'fifo', 'poison'];

/**
 * Run all three judicial taint models over the same graph and compare.
 * Prosecutors choose a model before filing; this shows exactly where the
 * choice matters: per-node spread plus terminal-receiver tainted sats under
 * each model. Pure function of nodes/links/seeds — no network.
 *
 * @returns {{
 *   maps: Record<string, Map<string, number>>,
 *   ledgers: Record<string, Array>,
 *   disagreement: Array<{nodeId, max, min, spread}>,
 *   maxSpread: number,
 *   terminalTaintedSats: Record<string, number>
 * }}
 */
export function compareTaintModels(nodes = [], links = [], taintedNodeIds = []) {
  const nodeSet = new Set((nodes || []).map(n => n.id));
  const maps = {};
  const ledgers = {};
  for (const model of TAINT_MODELS) {
    const map = calculateTaintMap(nodes, links, taintedNodeIds, model);
    maps[model] = map;
    ledgers[model] = generateTaintLedger(nodes, links, map);
  }
  const disagreement = (nodes || []).map(n => {
    const vals = TAINT_MODELS.map(m => maps[m].get(n.id) || 0);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    return { nodeId: n.id, max, min, spread: max - min };
  }).sort((a, b) => b.spread - a.spread);
  const maxSpread = disagreement.length > 0 ? disagreement[0].spread : 0;
  let receivers = (nodes || []).filter(n => n.type === 'receiver');
  if (receivers.length === 0) {
    const outCounts = new Map();
    nodes.forEach(n => outCounts.set(n.id, 0));
    links.forEach(l => {
      const src = typeof l.source === 'object' ? l.source.id : l.source;
      const tgt = typeof l.target === 'object' ? l.target.id : l.target;
      if (nodeSet.has(src) && nodeSet.has(tgt) && parseSats(l.value) > 0) {
        outCounts.set(src, (outCounts.get(src) || 0) + 1);
      }
    });
    receivers = (nodes || []).filter(n => (n.id.startsWith('out_') || (outCounts.get(n.id) || 0) === 0) && n.type !== 'suspect');
  }
  const terminalTaintedSats = {};
  for (const model of TAINT_MODELS) {
    terminalTaintedSats[model] = ledgers[model]
      .filter(row => receivers.some(r => r.id === row.nodeId))
      .reduce((s, row) => s + (row.taintedSats || 0), 0);
  }
  return { maps, ledgers, disagreement, maxSpread, terminalTaintedSats };
}

/**
 * Mechanical conservation audit over a computed taint map + edge map.
 * Catches post-hoc ledger edits and engine regressions before they reach
 * a Section 65B exhibit. Checks:
 *  1. every node taint within [0, 1];
 *  2. seeds pinned at 100%;
 *  3. zero-inflow non-seeds at 0%;
 *  4. FIFO conservation — a non-seed node never emits more tainted sats
 *     than flowed in (taint is never minted).
 *
 * @param {Map} [edgeMap] precomputed via calculateEdgeTaintMap (recomputed if omitted)
 * @param {Array<string>} [taintedNodeIds] explicit seeds (same fallback as calculateTaintMap)
 * @returns {{ passed: boolean, violations: Array<{nodeId, check, detail}> }}
 */
export function auditTaintConservation(nodes = [], links = [], taintMap = new Map(), model = 'proportionate', edgeMap = null, taintedNodeIds = []) {
  const violations = [];
  const nodeSet = new Set((nodes || []).map(n => n.id));
  // Mirror calculateTaintMap seed resolution exactly, or explicit seeds
  // would be misreported as violations.
  const seeds = new Set((taintedNodeIds || []).filter(id => nodeSet.has(id)));
  if (seeds.size === 0) {
    nodes.forEach(n => {
      if (n.type === 'suspect') seeds.add(n.id);
    });
  }
  if (seeds.size === 0 && nodes.length > 0) seeds.add(nodes[0].id);

  const inflowSats = new Map();
  nodes.forEach(n => inflowSats.set(n.id, 0));
  (links || []).forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    if (!nodeSet.has(src) || !nodeSet.has(tgt)) return;
    const sats = parseSats(l.value);
    if (sats > 0) inflowSats.set(tgt, (inflowSats.get(tgt) || 0) + sats);
  });

  for (const n of nodes || []) {
    const t = taintMap.get(n.id);
    if (t != null && !(t >= 0 && t <= 1)) {
      violations.push({ nodeId: n.id, check: 'bounds', detail: `taint ${t} outside [0,1]` });
    }
    if (seeds.has(n.id) && t !== 1.0) {
      violations.push({ nodeId: n.id, check: 'seed-pinned', detail: `seed taint ${t} !== 1.0` });
    }
    if (!seeds.has(n.id) && (inflowSats.get(n.id) || 0) === 0 && (t || 0) !== 0) {
      violations.push({ nodeId: n.id, check: 'zero-inflow', detail: `no value inflow but taint ${t}` });
    }
  }

  if (model === 'fifo') {
    const edges = edgeMap || calculateEdgeTaintMap(nodes, links, taintMap, 'fifo');
    const outTainted = new Map();
    nodes.forEach(n => outTainted.set(n.id, 0));
    (links || []).forEach((l) => {
      const src = typeof l.source === 'object' ? l.source.id : l.source;
      const tgt = typeof l.target === 'object' ? l.target.id : l.target;
      if (!nodeSet.has(src) || !nodeSet.has(tgt)) return;
      const sats = parseSats(l.value);
      if (sats <= 0) return;
      // Edge entries aggregate parallel pair links; re-split pro-rata so
      // per-link emission sums back to the pair total.
      const entry = edges.get(`${src}->${tgt}`);
      const give = entry && entry.totalSats > 0
        ? Math.round((entry.taintedSats / entry.totalSats) * sats)
        : 0;
      outTainted.set(src, (outTainted.get(src) || 0) + give);
    });
    for (const n of nodes || []) {
      if (seeds.has(n.id)) continue;
      const inflow = inflowSats.get(n.id) || 0;
      const t = taintMap.get(n.id) || 0;
      const allowed = Math.round(inflow * t) + 1; // +1 sat rounding tolerance
      if ((outTainted.get(n.id) || 0) > allowed) {
        violations.push({
          nodeId: n.id,
          check: 'fifo-conservation',
          detail: `emits ${outTainted.get(n.id)} tainted sats but holds ${Math.round(inflow * t)}`
        });
      }
    }
  }

  return { passed: violations.length === 0, violations };
}
