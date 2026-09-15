/**
 * AegisTrace Obfuscation & Mixer Forensics Engine (SIH1675 Core)
 * Analyzes on-chain structures for:
 * 1. CoinJoin / Equal-Denomination Mixing (Wasabi, Whirlpool, JoinMarket)
 * 2. Peeling Chain Structuring & Smurfing Velocity
 * 3. Instant Non-KYC Cross-Chain Swaps & Bridges (FixedFloat, SideShift, ThorChain)
 * 4. Shannon Entropy of Value Distributions
 */

import { scanCaseStructuring } from './structuringAnalysis';
import { exchangeDepositConfidence } from './traceHeuristics';
import { parseBtcAmount } from './forensicUtils';

// Known bridge/swap router fingerprints & prefixes
export const KNOWN_SWAP_ROUTERS = [
  { name: 'FixedFloat Instant Swap', pattern: '1Fixed', category: 'instant-exchanger', risk: 'high' },
  { name: 'ChangeNOW Non-Custodial', pattern: 'bc1qchg', category: 'instant-exchanger', risk: 'high' },
  { name: 'SideShift AI Router', pattern: '3Side', category: 'instant-exchanger', risk: 'high' },
  { name: 'ThorChain Asgard Vault', pattern: 'bc1qthor', category: 'cross-chain-bridge', risk: 'critical' },
  { name: 'SimpleSwap Custodial Bridge', pattern: '1Swap', category: 'bridge', risk: 'high' }
];

// Common mixing pool standard denominations in Satoshis
export const COINJOIN_POOLS_SATS = [
  500000,    // 0.005 BTC (Whirlpool micro)
  1000000,   // 0.01 BTC (Whirlpool mini)
  5000000,   // 0.05 BTC (Whirlpool standard)
  10000000,  // 0.1 BTC (Wasabi 1.0 standard)
  50000000   // 0.5 BTC (Whirlpool large)
];

/**
 * Calculates Shannon Entropy of output value distribution
 * H(X) = - Σ P(x) * log2(P(x))
 * A uniform distribution of identical denominations has maximum entropy.
 */
export function calculateOutputEntropy(values = []) {
  if (!values || values.length <= 1) return 0;
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return 0;

  let entropy = 0;
  for (const v of values) {
    if (v > 0) {
      const p = v / total;
      entropy -= p * Math.log2(p);
    }
  }
  return parseFloat(entropy.toFixed(3));
}

/**
 * Inspects a transaction for CoinJoin / Wasabi / Whirlpool signature
 * @param {Object} tx - Bitcoin transaction object with vout and vin arrays
 */
export function analyzeCoinJoinSignature(tx) {
  if (!tx || !Array.isArray(tx.vout) || tx.vout.length < 2) {
    return { isCoinJoin: false, confidence: 0, anonymitySet: 1, matchedPool: null };
  }

  const vouts = tx.vout;
  const values = vouts.map(o => o.value || 0);

  // Group by identical values (in Satoshis)
  const valueGroups = new Map();
  values.forEach(v => valueGroups.set(v, (valueGroups.get(v) || 0) + 1));

  let maxGroupCount = 0;
  let matchingValue = 0;
  for (const [val, count] of valueGroups.entries()) {
    if (count > maxGroupCount && val > 10000) { // filter out dust
      maxGroupCount = count;
      matchingValue = val;
    }
  }

  const entropy = calculateOutputEntropy(values);
  const matchedPool = COINJOIN_POOLS_SATS.find(poolVal => Math.abs(poolVal - matchingValue) < 500);

  // Signatures:
  // Wasabi 2.0 / Whirlpool: 3+ equal outputs, or matched standard pool denomination
  const isCoinJoin = maxGroupCount >= 3 || (maxGroupCount >= 2 && matchedPool);
  const confidence = matchedPool 
    ? Math.min(95, 50 + maxGroupCount * 12)
    : (maxGroupCount >= 4 ? 85 : maxGroupCount >= 3 ? 70 : 0);

  return {
    isCoinJoin: isCoinJoin && confidence >= 50,
    confidence,
    anonymitySet: maxGroupCount,
    matchingValueSats: matchingValue,
    matchingValueBtc: (matchingValue / 1e8).toFixed(4),
    entropy,
    matchedPool: matchedPool ? `${(matchedPool / 1e8).toFixed(3)} BTC Standard Pool` : null,
    outputCount: vouts.length,
    inputCount: tx.vin?.length || 0
  };
}

/**
 * Analyzes case transaction graph for peeling chains
 * Peeling chain: linear sequence where each hop pays a small amount (peel) and sends change to next hop.
 */
function linkEndpoints(l) {
  return {
    src: typeof l.source === 'object' ? l.source.id : l.source,
    tgt: typeof l.target === 'object' ? l.target.id : l.target,
    val: parseBtcAmount(l.value)
  };
}

function emptyPeelingResult() {
  return {
    isPeelingChain: false,
    chainLength: 0,
    hopCount: 0,
    linearHopCount: 0,
    compliantHopCount: 0,
    totalCaseHops: 0,
    suspectsIdentified: 0,
    receiversIdentified: 0,
    totalPeeledBtc: '0.0000',
    averagePeelEstimateBtc: '0.0000',
    averagePeelPct: '0%',
    layeringMaturity: 'Low'
  };
}

export function analyzeCasePeelingChains(nodes = [], links = []) {
  if (!nodes?.length || !links?.length) {
    return emptyPeelingResult();
  }

  const hops = nodes.filter(n => n.type === 'hop');
  const suspects = nodes.filter(n => n.type === 'suspect');
  const receivers = nodes.filter(n => n.type === 'receiver');

  const edges = links.map(linkEndpoints);

  // Count linear transit hops and verify value decay per hop: a genuine peel
  // forwards slightly less than it received (peel siphoned + miner fee), so a
  // hop whose outflow exceeds inflow is a consolidation/fan-in, not a peel.
  let linearHopCount = 0;
  let compliantHopCount = 0;
  const peelPcts = [];
  let peeledBtc = 0;

  hops.forEach(hop => {
    const inVal = edges.filter(e => e.tgt === hop.id).reduce((s, e) => s + e.val, 0);
    const outEdges = edges.filter(e => e.src === hop.id);
    const outVal = outEdges.reduce((s, e) => s + e.val, 0);
    if (outEdges.length >= 1) linearHopCount++;
    if (inVal > 0 && outEdges.length >= 1 && outVal <= inVal * 1.05) {
      compliantHopCount++;
      const peeled = Math.max(0, inVal - outVal);
      peeledBtc += peeled;
      peelPcts.push((peeled / inVal) * 100);
    }
  });

  const isPeeling = compliantHopCount >= 2 || (linearHopCount >= 3 && compliantHopCount >= linearHopCount - 1);
  const avgPeelPct = peelPcts.length > 0
    ? peelPcts.reduce((s, v) => s + v, 0) / peelPcts.length
    : 0;

  return {
    isPeelingChain: isPeeling,
    chainLength: compliantHopCount,
    hopCount: hops.length,
    linearHopCount,
    compliantHopCount,
    totalCaseHops: links.length,
    suspectsIdentified: suspects.length,
    receiversIdentified: receivers.length,
    totalPeeledBtc: peeledBtc.toFixed(4),
    averagePeelEstimateBtc: (peelPcts.length > 0 ? peeledBtc / peelPcts.length : 0).toFixed(4),
    averagePeelPct: `${avgPeelPct.toFixed(1)}%`,
    layeringMaturity: hops.length >= 4 ? 'Strong (4+ steps)' : hops.length >= 2 ? 'Moderate' : 'Low'
  };
}

/**
 * Scans addresses for instant swap routers or cross-chain bridge services
 */
export function scanCrossChainBridgeActivity(nodes = []) {
  const flaggedNodes = [];

  nodes.forEach(n => {
    const addr = n.details?.address || n.id || '';
    const name = n.entityName || n.label || '';
    
    // Check known swap routers
    const match = KNOWN_SWAP_ROUTERS.find(r => 
      addr.toLowerCase().includes(r.pattern.toLowerCase()) || 
      name.toLowerCase().includes(r.name.toLowerCase())
    );

    if (match) {
      flaggedNodes.push({
        nodeId: n.id,
        address: addr,
        routerName: match.name,
        category: match.category,
        risk: match.risk
      });
    } else if (name.toLowerCase().includes('swap') || name.toLowerCase().includes('bridge') || name.toLowerCase().includes('cross-chain')) {
      flaggedNodes.push({
        nodeId: n.id,
        address: addr,
        routerName: name,
        category: 'suspected-bridge',
        risk: 'high'
      });
    }
  });

  return {
    detected: flaggedNodes.length > 0,
    routersFound: flaggedNodes,
    count: flaggedNodes.length
  };
}

/**
 * Inspects a raw transaction for a consolidation sweep: many inputs collapsing
 * into a single output. When that output scores as custodial, the operator is
 * aggregating dispersed proceeds for imminent fiat cash-out — the highest
 * urgency pre-seizure signal in the toolkit.
 */
export function detectConsolidationSweep(tx) {
  const empty = { isSweep: false, inputCount: 0, sweptBtc: '0.0000', exchangeConf: 0, cashoutUrgency: 'none', confidence: 0 };
  if (!tx || !Array.isArray(tx.vin) || !Array.isArray(tx.vout)) return empty;

  const inputs = tx.vin.filter(v => (v.prevout?.value || 0) > 0);
  const valueOutputs = tx.vout.filter(o => (o.value || 0) > 0);
  if (inputs.length < 4 || valueOutputs.length !== 1) return empty;

  const inputSum = (tx.vin || []).reduce((s, v) => s + (v.prevout?.value || 0), 0);
  const swept = valueOutputs[0].value || 0;
  // A real sweep delivers ~all input value (minus fee) to one output
  if (inputSum <= 0 || swept < inputSum * 0.8) return empty;

  const out = valueOutputs[0];
  const addr = out.scriptpubkey_address || '';
  const exchangeConf = exchangeDepositConfidence(addr, out.scriptpubkey_type || '', { spent: false });
  const isCustodialCashout = exchangeConf > 0.4;
  const confidence = Math.min(95, 55 + Math.min(25, (inputs.length - 4) * 6) + (isCustodialCashout ? 15 : 0));

  return {
    isSweep: true,
    inputCount: inputs.length,
    sweptBtc: (swept / 1e8).toFixed(4),
    sweptSats: swept,
    exchangeConf: parseFloat(exchangeConf.toFixed(2)),
    cashoutUrgency: isCustodialCashout ? 'IMMINENT' : 'WATCH',
    confidence,
  };
}

/**
 * Graph-level sweep scan: nodes fed by 4+ value-bearing inputs that forward
 * (or terminate) as a single consolidated output.
 */
export function scanCaseSweeps(nodes = [], links = []) {
  if (!nodes?.length || !links?.length) {
    return { detected: false, sweeps: [], confidence: 0 };
  }
  const parseSats = (v) => Math.round(parseBtcAmount(v) * 1e8);
  const inEdges = new Map();
  const outEdges = new Map();
  nodes.forEach(n => { inEdges.set(n.id, []); outEdges.set(n.id, []); });
  links.forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    const sats = parseSats(l.value);
    if (sats <= 0) return;
    // Tolerate dangling endpoints (partial / pruned graphs): fan-in still counts.
    if (!inEdges.has(src)) { inEdges.set(src, []); outEdges.set(src, []); }
    if (!inEdges.has(tgt)) { inEdges.set(tgt, []); outEdges.set(tgt, []); }
    outEdges.get(src).push({ sats, target: tgt });
    inEdges.get(tgt).push({ sats, source: src });
  });

  const sweeps = [];
  nodes.forEach(n => {
    const ins = inEdges.get(n.id) || [];
    const outs = outEdges.get(n.id) || [];
    const inSum = ins.reduce((s, e) => s + e.sats, 0);
    const outSum = outs.reduce((s, e) => s + e.sats, 0);
    // Consolidation shape: fan-in of 4+, single onward output (or terminal),
    // value preserved through the node (minus fees).
    if (ins.length >= 4 && outs.length <= 1 && inSum > 0 && outSum >= inSum * 0.8) {
      const kyc = n.details?.kycStatus || '';
      const custodial = /IDENTITY|VERIFIED|EXCHANGE|DEPOSIT/i.test(kyc) || /exchange|gateway/i.test(n.entityName || '');
      sweeps.push({
        nodeId: n.id,
        inputCount: ins.length,
        consolidatedBtc: (Math.max(inSum, outSum) / 1e8).toFixed(4),
        custodial,
        cashoutUrgency: custodial ? 'IMMINENT' : 'WATCH',
      });
    }
  });

  if (sweeps.length === 0) return { detected: false, sweeps: [], confidence: 0 };
  const imminent = sweeps.some(s => s.cashoutUrgency === 'IMMINENT');
  return {
    detected: true,
    sweeps,
    confidence: imminent ? 88 : 70,
  };
}

/**
 * Full Obfuscation Dossier Report for a Case
 */
export function generateObfuscationDossier(activeCase) {
  if (!activeCase) return null;

  const nodes = activeCase.nodes || [];
  const links = activeCase.links || [];

  const peeling = analyzeCasePeelingChains(nodes, links);
  const bridgeScan = scanCrossChainBridgeActivity(nodes);
  const structuring = scanCaseStructuring(nodes, links);
  const sweeps = scanCaseSweeps(nodes, links);

  // Check for any mixer nodes in case
  const mixerNodes = nodes.filter(n => n.type === 'mixer');
  const hasMixer = mixerNodes.length > 0;

  // Composite Obfuscation Score (0 to 100)
  let score = 10;
  if (hasMixer) score += 40;
  if (peeling.isPeelingChain) score += Math.min(30, peeling.hopCount * 8);
  if (bridgeScan.detected) score += 25;
  if (structuring.detected) score += Math.min(20, 10 + structuring.maxBandSize * 2);
  if (sweeps.detected) score += sweeps.confidence >= 80 ? 15 : 8;

  const obfuscationScore = Math.min(100, score);

  let rating = 'Low';
  let badgeColor = '#10b981';
  if (obfuscationScore >= 75) {
    rating = 'High';
    badgeColor = '#ef4444';
  } else if (obfuscationScore >= 45) {
    rating = 'Medium';
    badgeColor = '#f59e0b';
  }

  const recommendations = [];
  if (hasMixer) recommendations.push('Mixer involved: amounts past this point are estimates, not proven funds.');
  if (peeling.isPeelingChain) recommendations.push('Follow the largest change outputs downstream to find where the money gathers.');
  if (bridgeScan.detected) recommendations.push('Ask the swap service for records (a foreign legal request may be needed).');
  if (structuring.detected) recommendations.push(`Batch of ${structuring.maxBandSize} similar payments found — trace the shared funding source one step back to find who controls it.`);
  if (sweeps.detected) {
    const imminent = sweeps.sweeps.some(s => s.cashoutUrgency === 'IMMINENT');
    recommendations.push(imminent
      ? 'Likely cash-out: gathered funds reached an exchange-held account — send the Section 67 notice before the money leaves.'
      : 'Funds were gathered into one wallet — watch the destination address for the next move.');
  }
  if (recommendations.length === 0) recommendations.push('Send the standard Section 67 identity notice to the end exchange.');

  return {
    caseId: activeCase.id,
    obfuscationScore,
    rating,
    badgeColor,
    peeling,
    bridgeScan,
    structuring,
    sweeps,
    hasMixer,
    mixerCount: mixerNodes.length,
    recommendations
  };
}
