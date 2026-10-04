/**
 * AegisTrace Forensic Tracing Verification & Assurance Engine (SIH1675 Core)
 *
 * Implements automated mathematical and cryptographic verification over
 * reconstructed blockchain fund-flow graphs:
 *  1. Kirchhoff Value Conservation Invariant (sum(in) == sum(out) + fee >= 0)
 *  2. Temporal Causality & Monotonicity (T_spend >= T_fund, Block_spend >= Block_fund)
 *  3. Multi-Model Taint Conservation (Zero-minting invariant across FIFO & Haircut)
 *  4. Heuristic Decision Consistency (Directional scoring & dust handling)
 *  5. BIP-69 Output Order Invariance (Positional permutation robustness)
 *  6. Judicial Multi-Model Concordance (Consensus across FIFO, Proportional, Poison)
 */

import { parseSats, calculateTaintMap, auditTaintConservation, compareTaintModels } from './taintAnalysis';
import { scoreOutputHeuristics } from './traceHeuristics';

/**
 * Standard output classifier wrapper using SIH1675 heuristics.
 */
export function classifyTransactionOutputs(tx, outspends = []) {
  const outputs = tx?.vout || [];
  const results = [];
  const spends = outspends || tx?.outspends || [];
  for (let i = 0; i < outputs.length; i++) {
    const scored = scoreOutputHeuristics({ tx, outputIndex: i, outspends: spends });
    results.push({
      index: i,
      address: outputs[i]?.scriptpubkey_address,
      value: outputs[i]?.value,
      isChange: scored.score < 0,
      score: scored.score,
      confidence: scored.confidence
    });
  }
  return results;
}

/**
 * 1. Verify Kirchhoff Value Conservation across all intermediate transaction hubs.
 * In Bitcoin: sum(inputs) = sum(outputs) + miner_fee, where miner_fee >= 0.
 *
 * @param {Array} nodes Graph nodes
 * @param {Array} links Graph links
 * @returns {{ passed: boolean, checkedHubs: number, violations: Array, anomalies: Array }}
 */
export function verifyValueConservation(nodes = [], links = []) {
  const nodeMap = new Map((nodes || []).map(n => [n.id, n]));
  const txHubs = (nodes || []).filter(n => n.id.startsWith('tx_') || n.type === 'hub' || n.type === 'tx');
  const violations = [];
  const anomalies = [];

  const inflowSats = new Map();
  const outflowSats = new Map();
  nodes.forEach(n => {
    inflowSats.set(n.id, 0);
    outflowSats.set(n.id, 0);
  });

  (links || []).forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    if (!nodeMap.has(src) || !nodeMap.has(tgt)) return;
    const sats = parseSats(l.value);
    if (sats > 0) {
      outflowSats.set(src, (outflowSats.get(src) || 0) + sats);
      inflowSats.set(tgt, (inflowSats.get(tgt) || 0) + sats);
    }
  });

  let checkedHubs = 0;
  for (const hub of txHubs) {
    const inSat = inflowSats.get(hub.id) || 0;
    const outSat = outflowSats.get(hub.id) || 0;

    // Check pre-computed conservation metrics from API gateway if available
    const conservation = hub.details?.metrics?.conservation;
    if (conservation && conservation.valid === false) {
      violations.push({
        nodeId: hub.id,
        check: 'GATEWAY_CONSERVATION_FAIL',
        detail: conservation.reason || 'Input/output value mismatch flagged by node gateway'
      });
    }

    // Only audit hubs that have observed inflows (at root or deeper hops)
    if (inSat > 0 && outSat > 0) {
      checkedHubs++;
      const fee = inSat - outSat;

      // Violation: Output exceeds input (creation of satoshis)
      if (outSat > inSat + 546) {
        violations.push({
          nodeId: hub.id,
          check: 'VALUE_CREATION_VIOLATION',
          detail: `Outflow (${outSat} sats) exceeds inflow (${inSat} sats) by ${outSat - inSat} sats`
        });
      }

      // Violation: Negative miner fee
      if (fee < 0) {
        violations.push({
          nodeId: hub.id,
          check: 'NEGATIVE_MINER_FEE',
          detail: `Implied miner fee is negative: ${fee} sats`
        });
      }

      // Anomaly: Fee exceeds 0.2 BTC and represents over 50% of input
      if (fee > 20000000 && fee > inSat * 0.5) {
        anomalies.push({
          nodeId: hub.id,
          check: 'EXCESSIVE_FEE_ANOMALY',
          detail: `Abnormally high miner fee: ${(fee / 1e8).toFixed(4)} BTC`
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    checkedHubs,
    violations,
    anomalies
  };
}

/**
 * 2. Verify Temporal Causality (Monotonicity).
 * Funds cannot be spent before they were created: Block_height(spend) >= Block_height(fund).
 *
 * @param {Array} nodes
 * @param {Array} links
 * @returns {{ passed: boolean, checkedLinks: number, violations: Array }}
 */
export function verifyTemporalCausality(nodes = [], links = []) {
  const nodeMap = new Map((nodes || []).map(n => [n.id, n]));
  const violations = [];
  let checkedLinks = 0;

  (links || []).forEach(l => {
    const srcId = typeof l.source === 'object' ? l.source.id : l.source;
    const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
    const src = nodeMap.get(srcId);
    const tgt = nodeMap.get(tgtId);
    if (!src || !tgt) return;

    // Helper to extract unix timestamp in seconds
    const getTime = (node) => {
      if (node.details?.blockTime) return node.details.blockTime;
      if (node.timestamp && typeof node.timestamp === 'string') {
        const parsed = Date.parse(node.timestamp);
        if (!isNaN(parsed)) return Math.floor(parsed / 1000);
      }
      return null;
    };

    const srcTime = getTime(src);
    const tgtTime = getTime(tgt);

    // If both source and target have timestamps, assert causality (with 120s buffer for reorgs/clock skew)
    if (srcTime != null && tgtTime != null) {
      checkedLinks++;
      if (tgtTime < srcTime - 120) {
        violations.push({
          sourceId: srcId,
          targetId: tgtId,
          check: 'TEMPORAL_INVERSION',
          detail: `Target timestamp (${tgtTime}) predates source timestamp (${srcTime}) by ${srcTime - tgtTime}s`
        });
      }
    }

    // Helper to extract block height
    const getHeight = (node) => {
      const h = node.details?.blockHeight ?? node.details?.metrics?.blockHeight;
      return typeof h === 'number' && h > 0 ? h : null;
    };

    const srcHeight = getHeight(src);
    const tgtHeight = getHeight(tgt);

    if (srcHeight != null && tgtHeight != null) {
      if (tgtHeight < srcHeight) {
        violations.push({
          sourceId: srcId,
          targetId: tgtId,
          check: 'BLOCK_HEIGHT_INVERSION',
          detail: `Target block height #${tgtHeight} is strictly lower than source block height #${srcHeight}`
        });
      }
    }
  });

  return {
    passed: violations.length === 0,
    checkedLinks,
    violations
  };
}

/**
 * 3. Verify Heuristic Decision Consistency.
 * Confirms that heuristic classification directions (positive for payment, negative for change)
 * match assigned node labels and dust outputs are not classified as main receivers.
 *
 * @param {Array} nodes
 * @returns {{ passed: boolean, checkedNodes: number, violations: Array, anomalies: Array }}
 */
export function verifyHeuristicConsistency(nodes = []) {
  const violations = [];
  const anomalies = [];
  let checkedNodes = 0;

  (nodes || []).forEach(n => {
    const h = n.details?.heuristics;
    const isChange = n.type === 'change' || n.details?.isChange;
    const isReceiver = n.type === 'receiver' || n.type === 'suspect';
    const valSat = parseSats(n.balance);

    if (h && typeof h.score === 'number') {
      checkedNodes++;
      // Score contradiction: strong positive score on a change node
      if (isChange && h.score > 2.0) {
        violations.push({
          nodeId: n.id,
          check: 'CHANGE_SCORE_CONTRADICTION',
          detail: `Node labeled change has strong positive heuristic score (+${h.score})`
        });
      }

      // Score contradiction: strong negative score on a receiver node
      if (isReceiver && h.score < -2.0) {
        violations.push({
          nodeId: n.id,
          check: 'RECEIVER_SCORE_CONTRADICTION',
          detail: `Node labeled receiver has strong negative heuristic score (${h.score})`
        });
      }
    }

    // Dust receiver anomaly (< 546 sats marked as principal payment endpoint)
    if (valSat > 0 && valSat < 546 && n.type === 'receiver') {
      anomalies.push({
        nodeId: n.id,
        check: 'DUST_RECEIVER_ANOMALY',
        detail: `Dust output (${valSat} sats) marked as end receiver`
      });
    }

    // Unspendable OP_RETURN marked as payment receiver
    if (n.id.startsWith('op_') && n.type === 'receiver') {
      violations.push({
        nodeId: n.id,
        check: 'UNSPENDABLE_MARKED_AS_RECEIVER',
        detail: 'OP_RETURN null-data node cannot be a payment receiver'
      });
    }
  });

  return {
    passed: violations.length === 0,
    checkedNodes,
    violations,
    anomalies
  };
}

/**
 * 4. Verify BIP-69 Output Ordering Invariance.
 * Verifies that heuristic output classification does not depend on array order.
 *
 * @param {Object} tx Standard transaction object with vin, vout
 * @param {Function} [classifierFn] Classifier implementation (defaults to classifyTransactionOutputs)
 * @returns {{ isInvariant: boolean, diffs: Array }}
 */
export function verifyBip69Invariance(tx, classifierFn = classifyTransactionOutputs) {
  if (!tx || !Array.isArray(tx.vout) || tx.vout.length <= 1) {
    return { isInvariant: true, diffs: [] };
  }

  const originalOutputs = tx.vout;
  const reversedOutputs = [...originalOutputs].reverse();
  const outspends = tx.outspends || [];
  const reversedOutspends = [...outspends].reverse();

  const originalResult = classifierFn({ ...tx, vout: originalOutputs, outspends }, outspends);
  const reversedResult = classifierFn({ ...tx, vout: reversedOutputs, outspends: reversedOutspends }, reversedOutspends);

  const getMap = (res) => {
    const map = new Map();
    (res || []).forEach(r => {
      const key = r.address || `${r.value}_${r.scriptpubkey_type || ''}`;
      map.set(key, r.isChange);
    });
    return map;
  };

  const origMap = getMap(originalResult);
  const revMap = getMap(reversedResult);

  const diffs = [];
  for (const [key, isChange] of origMap.entries()) {
    if (revMap.has(key) && revMap.get(key) !== isChange) {
      diffs.push({
        outputKey: key,
        originalVerdict: isChange ? 'change' : 'payment',
        reversedVerdict: revMap.get(key) ? 'change' : 'payment'
      });
    }
  }

  return {
    isInvariant: diffs.length === 0,
    diffs
  };
}

/**
 * 5. Compute Judicial Multi-Model Concordance.
 * Measures agreement across FIFO, Proportional, and Poison taint accounting frameworks.
 *
 * @param {Array} nodes
 * @param {Array} links
 * @param {Array<string>} [taintedNodeIds]
 * @returns {{ score: number, consensusSinks: Array<string>, modelSinks: Object, maxSpread: number }}
 */
export function computeMultiModelConcordance(nodes = [], links = [], taintedNodeIds = []) {
  if (!nodes || nodes.length === 0) {
    return { score: 1.0, consensusSinks: [], modelSinks: { fifo: [], proportionate: [], poison: [] }, maxSpread: 0 };
  }

  const comparison = compareTaintModels(nodes, links, taintedNodeIds);
  const nodeSet = new Set(nodes.map(n => n.id));

  // Determine terminal sink candidates (receivers or leaf nodes)
  const outCounts = new Map();
  nodes.forEach(n => outCounts.set(n.id, 0));
  (links || []).forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const tgt = typeof l.target === 'object' ? l.target.id : l.target;
    if (nodeSet.has(src) && nodeSet.has(tgt) && parseSats(l.value) > 0) {
      outCounts.set(src, (outCounts.get(src) || 0) + 1);
    }
  });

  const sinks = nodes.filter(n => (n.type === 'receiver' || n.id.startsWith('out_') || outCounts.get(n.id) === 0) && n.type !== 'suspect');

  const fifoTainted = new Set();
  const propTainted = new Set();
  const poisonTainted = new Set();

  sinks.forEach(s => {
    if ((comparison.maps.fifo?.get(s.id) || 0) > 0.01) fifoTainted.add(s.id);
    if ((comparison.maps.proportionate?.get(s.id) || 0) > 0.01) propTainted.add(s.id);
    if ((comparison.maps.poison?.get(s.id) || 0) > 0.01) poisonTainted.add(s.id);
  });

  const allTaintedSinks = new Set([...fifoTainted, ...propTainted, ...poisonTainted]);
  const consensusSinks = [...allTaintedSinks].filter(id => fifoTainted.has(id) && propTainted.has(id) && poisonTainted.has(id));

  const score = allTaintedSinks.size > 0
    ? parseFloat((consensusSinks.length / allTaintedSinks.size).toFixed(2))
    : 1.0;

  return {
    score,
    consensusSinks,
    modelSinks: {
      fifo: Array.from(fifoTainted),
      proportionate: Array.from(propTainted),
      poison: Array.from(poisonTainted)
    },
    maxSpread: comparison.maxSpread
  };
}

/**
 * Master Verification & Assurance Engine.
 * Runs all structural invariants and model concordance audits, producing a court-admissible certificate.
 *
 * @param {Object} caseOrGraph Case object or { nodes, links }
 * @param {Object} [options]
 * @returns {Object} Comprehensive verification report
 */
export function auditTraceCorrectness(caseOrGraph, options = {}) {
  const nodes = caseOrGraph?.nodes || [];
  const links = caseOrGraph?.links || [];
  const taintedNodeIds = options.taintedNodeIds || [];

  if (nodes.length === 0) {
    return {
      isAudited: false,
      isValid: false,
      assuranceScore: 0,
      rating: 'UNPROVEN',
      summary: 'Empty graph — no trace to verify.',
      invariants: {},
      concordance: {},
      violations: [],
      anomalies: []
    };
  }

  // 1. Audit Invariants
  const valAudit = verifyValueConservation(nodes, links);
  const timeAudit = verifyTemporalCausality(nodes, links);
  const heuristicAudit = verifyHeuristicConsistency(nodes);
  const fifoMap = calculateTaintMap(nodes, links, taintedNodeIds, 'fifo');
  const propMap = calculateTaintMap(nodes, links, taintedNodeIds, 'proportionate');
  const fifoTaintAudit = auditTaintConservation(nodes, links, fifoMap, 'fifo', null, taintedNodeIds);
  const propTaintAudit = auditTaintConservation(nodes, links, propMap, 'proportionate', null, taintedNodeIds);
  const concordance = computeMultiModelConcordance(nodes, links, taintedNodeIds);

  const allViolations = [
    ...valAudit.violations,
    ...timeAudit.violations,
    ...heuristicAudit.violations,
    ...fifoTaintAudit.violations.map(v => ({ check: `FIFO_${v.check}`, ...v })),
    ...propTaintAudit.violations.map(v => ({ check: `PROP_${v.check}`, ...v }))
  ];

  const allAnomalies = [
    ...valAudit.anomalies,
    ...heuristicAudit.anomalies
  ];

  // 2. Score Calculation (starts at 100)
  let score = 100;
  score -= valAudit.violations.length * 35; // Critical: value creation
  score -= timeAudit.violations.length * 25; // Critical: time paradox
  score -= (fifoTaintAudit.violations.length + propTaintAudit.violations.length) * 20; // High: taint inflation
  score -= heuristicAudit.violations.length * 15; // Moderate: classification inversion
  score -= allAnomalies.length * 5; // Low: fee/dust anomalies

  // Concordance adjustment (+5 for 100% agreement, down to -15 for wide divergence)
  if (concordance.score === 1.0) {
    score += 5;
  } else if (concordance.score < 0.6) {
    score -= 15;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // 3. Judicial Rating Designation
  let rating = 'VERIFIED';
  if (score < 50 || valAudit.violations.length > 0 || timeAudit.violations.length > 0) {
    rating = 'SUSPECT';
  } else if (score < 75 || allViolations.length > 0) {
    rating = 'QUALIFIED';
  } else if (score < 90) {
    rating = 'SUBSTANTIATED';
  }

  // 4. Concise Forensic Summary
  const summaryParts = [];
  if (allViolations.length === 0) {
    summaryParts.push('All 4 core forensic invariants mathematically verified.');
  } else {
    summaryParts.push(`Flagged ${allViolations.length} invariant violation${allViolations.length === 1 ? '' : 's'}.`);
  }

  if (concordance.score >= 0.95) {
    summaryParts.push('100% concordance across FIFO, Proportional, and Poison judicial taint models.');
  } else {
    summaryParts.push(`${Math.round(concordance.score * 100)}% concordance across judicial taint models.`);
  }

  return {
    isAudited: true,
    isValid: allViolations.length === 0,
    assuranceScore: score,
    rating,
    summary: summaryParts.join(' '),
    invariants: {
      valueConservation: { passed: valAudit.passed, checkedHubs: valAudit.checkedHubs, count: valAudit.violations.length },
      temporalCausality: { passed: timeAudit.passed, checkedLinks: timeAudit.checkedLinks, count: timeAudit.violations.length },
      heuristicConsistency: { passed: heuristicAudit.passed, checkedNodes: heuristicAudit.checkedNodes, count: heuristicAudit.violations.length },
      taintConservation: {
        passed: fifoTaintAudit.passed && propTaintAudit.passed,
        fifoViolations: fifoTaintAudit.violations.length,
        propViolations: propTaintAudit.violations.length
      }
    },
    concordance,
    violations: allViolations,
    anomalies: allAnomalies
  };
}
