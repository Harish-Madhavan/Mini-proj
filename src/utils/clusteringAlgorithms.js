/**
 * AegisTrace Forensic Clustering Algorithms (SIH1675 Core)
 * Implements:
 * 1. Disjoint Set Union (DSU / Union-Find) with path compression & rank heuristic.
 * 2. Multi-Input Common Input Ownership Heuristic (CIOH) clustering.
 * 3. Shannon Entropy Mixing Analysis for CoinJoin / Wasabi / Whirlpool protocols:
 *    H(X) = - sum(p(x) * log2(p(x)))
 * 4. Peeling Chain & Change Output Identification Heuristics.
 * 5. Cluster Confidence & Entity Pivot Extraction.
 */

import { cyrb53Hex } from './forensicUtils';

/**
 * Disjoint Set Union (Union-Find) data structure.
 * Supports nearly O(1) amortized operations via path compression and rank optimization.
 */
export class DisjointSetUnion {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  /**
   * Register a new element in the disjoint set if not already present.
   */
  makeSet(x) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  /**
   * Find root representative of element with path compression.
   */
  find(x) {
    this.makeSet(x);
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)));
    }
    return this.parent.get(x);
  }

  /**
   * Union two sets by rank.
   */
  union(x, y) {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return false;

    const rankX = this.rank.get(rootX) || 0;
    const rankY = this.rank.get(rootY) || 0;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
    return true;
  }

  /**
   * Return all disjoint clusters grouped by root representative.
   */
  getClusters() {
    const clusters = new Map();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!clusters.has(root)) {
        clusters.set(root, []);
      }
      clusters.get(root).push(key);
    }
    return Array.from(clusters.values());
  }
}

/**
 * Standard CoinJoin pool denominations in satoshis (Wasabi 1.0 / Whirlpool).
 * Mirrors COINJOIN_POOLS_SATS in obfuscationForensics (kept local so this
 * module stays dependency-free).
 */
const STANDARD_MIX_POOLS_SATS = new Set([500000, 1000000, 5000000, 10000000, 50000000]);

/**
 * Calculate Shannon Entropy of transaction outputs to measure mixing quality / anonymity set.
 * H(X) = - sum(p(x) * log2(p(x))) where p(x) = val / sum(val)
 * Higher entropy -> higher privacy / obfuscation (equal-value splits).
 *
 * @param {Array<{ value: number }>} outputs - List of outputs with numeric satoshi values
 * @returns {{ entropy: number, maxPossibleEntropy: number, anonymityRatio: number, isCoinJoin: boolean }}
 */
export function calculateCoinJoinEntropy(outputs = []) {
  const validOutputs = outputs.filter(o => o && typeof o.value === 'number' && o.value > 0);
  if (validOutputs.length <= 1) {
    return { entropy: 0, maxPossibleEntropy: 0, anonymityRatio: 0, isCoinJoin: false };
  }

  const totalValue = validOutputs.reduce((acc, o) => acc + o.value, 0);
  if (totalValue === 0) {
    return { entropy: 0, maxPossibleEntropy: 0, anonymityRatio: 0, isCoinJoin: false };
  }

  // Calculate probabilities
  let entropy = 0;
  validOutputs.forEach(o => {
    const p = o.value / totalValue;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  });

  const maxPossibleEntropy = Math.log2(validOutputs.length);
  const anonymityRatio = maxPossibleEntropy > 0 ? (entropy / maxPossibleEntropy) : 0;

  // Check for equal-denomination outputs. A coincidental pair inside a large
  // batch is NOT mixing (cf. real 8-in-147-out batch with one triple that the
  // old >=2 rule misflagged): the dominant group must OWN a substantial share
  // of outputs. False positives are costlier than misses here — a false mix
  // HALTS the trace and poisons taint, while a missed mix merely traces through.
  const valueFrequencies = {};
  validOutputs.forEach(o => {
    valueFrequencies[o.value] = (valueFrequencies[o.value] || 0) + 1;
  });
  let modalValue = 0;
  let maxEqualOutputs = 0;
  for (const [val, count] of Object.entries(valueFrequencies)) {
    if (count > maxEqualOutputs) { maxEqualOutputs = count; modalValue = Number(val); }
  }
  const dominantShare = validOutputs.length > 0 ? maxEqualOutputs / validOutputs.length : 0;
  // Pool lane is share-gated too: a handful of round-denomination outputs
  // inside a large batch (payroll, faucet drips) is not a CoinJoin.
  const isCoinJoin = (maxEqualOutputs >= 3 && dominantShare >= 0.2)
    || (maxEqualOutputs >= 2 && dominantShare >= 0.1 && STANDARD_MIX_POOLS_SATS.has(modalValue));

  return {
    entropy: parseFloat(entropy.toFixed(3)),
    maxPossibleEntropy: parseFloat(maxPossibleEntropy.toFixed(3)),
    anonymityRatio: parseFloat(anonymityRatio.toFixed(3)),
    isCoinJoin
  };
}

/**
 * Common Input Ownership Heuristic (CIOH) clustering algorithm.
 * Groups addresses that appear together as inputs in multi-input transactions.
 *
 * @param {Array<string>} addresses - Pool of suspect addresses
 * @param {Array<Object>} transactionHistory - List of transactions with vin arrays
 * @returns {Object} Comprehensive cluster analysis report
 */
export function computeAddressClusters(addresses = [], transactionHistory = []) {
  if (!addresses || addresses.length === 0) {
    return null;
  }

  const dsu = new DisjointSetUnion();
  addresses.forEach(addr => dsu.makeSet(addr));
  const addressSet = new Set(addresses);

  const coSpentTransactions = [];
  const sharedTxFrequency = {};
  let skippedCoinJoinTxs = 0;

  // Deduplicate transactions by txid if present
  const seenTxIds = new Set();
  const uniqueTxs = [];
  (Array.isArray(transactionHistory) ? transactionHistory : []).forEach(tx => {
    if (!tx) return;
    const id = tx.txid || tx.id;
    if (id) {
      if (seenTxIds.has(id)) return;
      seenTxIds.add(id);
    }
    uniqueTxs.push(tx);
  });

  // Process transaction inputs for co-spending. CoinJoin-style mixes are
  // explicitly excluded: co-spending inside a privacy pool does NOT imply
  // common ownership (CIOH exception) and linking it would poison the case.
  uniqueTxs.forEach(tx => {
    const vin = tx.vin || [];
    const inputAddrs = vin
      .map(v => v.prevout?.scriptpubkey_address || v.address)
      .filter(Boolean);

    const relevantInputs = inputAddrs.filter(addr => addressSet.has(addr));

    if (relevantInputs.length >= 2) {
      const entropy = calculateCoinJoinEntropy(
        (tx.vout || []).map(o => ({ value: o?.value || o?.scriptpubkey_value || 0 }))
      );
      const looksLikeMix = entropy.isCoinJoin || (vin.length >= 5 && relevantInputs.length >= 3 && entropy.anonymityRatio > 0.8);
      if (looksLikeMix) {
        skippedCoinJoinTxs++;
        return;
      }
      coSpentTransactions.push({
        txid: tx.txid || tx.id,
        inputs: relevantInputs
      });

      for (let i = 0; i < relevantInputs.length; i++) {
        for (let j = i + 1; j < relevantInputs.length; j++) {
          dsu.union(relevantInputs[i], relevantInputs[j]);
          const pairKey = [relevantInputs[i], relevantInputs[j]].sort().join('<->');
          sharedTxFrequency[pairKey] = (sharedTxFrequency[pairKey] || 0) + 1;
        }
      }
    }
  });

  const clusters = dsu.getClusters();
  const largestCluster = clusters.reduce((best, c) => (c.length > (best?.length || 0) ? c : best), clusters[0] || []);
  const isSplit = clusters.length > 1;

  // Generate deterministic cluster identifier
  const clusterHash = cyrb53Hex([...addresses].sort().join('|')).slice(0, 8);

  // Script-type uniformity: a same-type claim is only valid when the pool is
  // actually uniform. Mixed pools get no type heuristic, not a wrong one.
  const typeOf = (a) =>
    a.startsWith('bc1q') || a.startsWith('bc1p') ? 'segwit'
    : a.startsWith('1') ? 'legacy'
    : a.startsWith('3') ? 'script'
    : 'other';
  const poolTypes = new Set(addresses.map(typeOf));
  const uniformType = poolTypes.size === 1 ? [...poolTypes][0] : null;

  // Confidence must be *earned* by on-chain evidence: a pool with zero
  // co-spends is an unproven hypothesis, not a 50%+ attribution.
  const hasEvidence = coSpentTransactions.length > 0;
  let confidence;
  if (hasEvidence) {
    confidence = 50 + Math.min(30, coSpentTransactions.length * 15);
    if (uniformType === 'segwit') confidence += 4;
    if (addresses.length >= 3) confidence += 3;
    confidence = Math.min(99, Math.max(30, confidence));
  } else {
    confidence = 30;
    if (addresses.length >= 3) confidence += 3;
    confidence = Math.min(45, confidence);
  }

  const heuristicsApplied = [];
  if (coSpentTransactions.length > 0) {
    heuristicsApplied.push(`Verified: ${coSpentTransactions.length} joint transaction${coSpentTransactions.length === 1 ? '' : 's'}`);
    if (isSplit) {
      heuristicsApplied.push(
        `Split into ${clusters.length} groups — largest holds ${largestCluster.length}/${addresses.length} addresses`
      );
    }
  } else {
    heuristicsApplied.push(`No joint transactions found across ${addresses.length} addresses — unproven`);
  }

  if (uniformType === 'segwit') {
    heuristicsApplied.push("Same address type (SegWit)");
  } else if (uniformType === 'legacy') {
    heuristicsApplied.push("Same address type (legacy)");
  } else if (uniformType === 'script') {
    heuristicsApplied.push("Same address type (script)");
  }

  if (skippedCoinJoinTxs > 0) {
    heuristicsApplied.push(
      `Excluded ${skippedCoinJoinTxs} CoinJoin-style mix${skippedCoinJoinTxs === 1 ? '' : 'es'} (co-spend inside mixes proves nothing)`
    );
  }

  return {
    clusterId: `CLUS-BTC-${clusterHash}`,
    confidenceScore: confidence,
    addressCount: addresses.length,
    clustersCount: clusters.length,
    clusters,
    largestCluster,
    isSplit,
    hasEvidence,
    skippedCoinJoinTxs,
    heuristicsApplied,
    coSpentTransactions,
    addresses: [...addresses]
  };
}

/**
 * Effective fee rate of a transaction in sat/vB.
 */
export function txFeeRateSatVb(tx) {
  if (!tx || !Number.isFinite(tx.fee)) return null;
  const vsize = tx.weight ? Math.ceil(tx.weight / 4) : (tx.vsize || tx.size || 0);
  if (!vsize || vsize <= 0) return null;
  return tx.fee / vsize;
}

/**
 * Fee-fingerprint similarity: wallets betray themselves through fee habits —
 * the same operator's transactions cluster around preferred sat/vB tiers and
 * input counts even when addresses never co-spend. Compares two transactions
 * and returns a same-wallet likelihood.
 *
 * @returns {{ similarity: number, verdict: 'SAME_WALLET_LIKELY'|'INCONCLUSIVE'|'DISTINCT_WALLETS', rateA: number|null, rateB: number|null }}
 */
export function feeFingerprintSimilarity(txA, txB) {
  const rateA = txFeeRateSatVb(txA);
  const rateB = txFeeRateSatVb(txB);
  if (rateA == null || rateB == null || rateA <= 0 || rateB <= 0) {
    return { similarity: 0, verdict: 'INCONCLUSIVE', rateA, rateB };
  }

  // Log-distance: fee tiers are multiplicative (1 / 10 / 100 sat/vB regimes)
  const logDist = Math.abs(Math.log10(rateA) - Math.log10(rateB));
  const rateComponent = Math.max(0, 1 - logDist / 1.5); // 1.5 orders of magnitude apart => unrelated

  // Structural bonus: same input-count class (single / few / batch) suggests one wallet's coin selection
  const classOf = (n) => (n <= 1 ? 0 : n <= 3 ? 1 : 2);
  const insA = (txA.vin || []).length;
  const insB = (txB.vin || []).length;
  const structureBonus = classOf(insA) === classOf(insB) ? 0.15 : -0.1;

  const similarity = parseFloat(Math.min(1, Math.max(0, 0.15 + rateComponent * 0.7 + structureBonus)).toFixed(2));
  const verdict = similarity >= 0.7 ? 'SAME_WALLET_LIKELY' : similarity >= 0.4 ? 'INCONCLUSIVE' : 'DISTINCT_WALLETS';
  return { similarity, verdict, rateA: parseFloat(rateA.toFixed(2)), rateB: parseFloat(rateB.toFixed(2)) };
}

/**
 * Measure funds received by an address pool across fetched transactions.
 * Credits only (outputs paying pool addresses) — never netted, because
 * address-history windows are partial and unseen older credits would push
 * naive balances negative. Returns observed coverage alongside the total so
 * callers can say "received X across N checked transactions" instead of
 * inventing a balance.
 *
 * @returns {{ totalSats: number, perAddressSats: object, observedTxCount: number }}
 */
export function estimatePoolReceived(addresses = [], transactions = []) {
  const pool = new Set(addresses);
  const perAddressSats = {};
  let totalSats = 0;
  const rawTxs = Array.isArray(transactions) ? transactions : [];
  const seenTxIds = new Set();
  const txs = [];
  for (const tx of rawTxs) {
    if (!tx) continue;
    const id = tx.txid || tx.id;
    if (id) {
      if (seenTxIds.has(id)) continue;
      seenTxIds.add(id);
    }
    txs.push(tx);
  }

  for (const tx of txs) {
    for (const o of tx?.vout || []) {
      const addr = o?.scriptpubkey_address;
      if (addr && pool.has(addr) && Number.isFinite(o.value) && o.value > 0) {
        totalSats += o.value;
        perAddressSats[addr] = (perAddressSats[addr] || 0) + o.value;
      }
    }
  }
  return { totalSats, perAddressSats, observedTxCount: txs.length };
}

/**
 * Peeling Chain Heuristic Detector — Enhanced
 * Handles 2-output peel, multi-output peeling (one large change + many small peels), temporal sequencing, and value decay.
 *
 * @param {Array<Object>} transactions - Chronological list of transactions (ordered by block_time if available)
 * @returns {{ isPeelingChain: boolean, hopCount: number, averagePeelPercent: number, confidence: number, details: object }}
 */
export function detectPeelingChain(transactions = []) {
  if (!transactions || transactions.length < 1) {
    return { isPeelingChain: false, hopCount: 0, averagePeelPercent: 0, confidence: 0, details: {} };
  }

  // Deduplicate by txid if present
  const seenTxIds = new Set();
  const deduped = [];
  (Array.isArray(transactions) ? transactions : []).forEach(tx => {
    if (!tx) return;
    const id = tx.txid || tx.id;
    if (id) {
      if (seenTxIds.has(id)) return;
      seenTxIds.add(id);
    }
    deduped.push(tx);
  });

  if (deduped.length < 1) {
    return { isPeelingChain: false, hopCount: 0, averagePeelPercent: 0, confidence: 0, details: {} };
  }

  // Sort by block_time/status if available
  const sorted = [...deduped].sort((a, b) => {
    const tA = a.status?.block_time ?? a.block_time ?? 0;
    const tB = b.status?.block_time ?? b.block_time ?? 0;
    return tA - tB;
  });

  let peelingHopCount = 0;
  const peelPercentages = [];
  const hopDetails = [];
  let prevChangeValue = null;

  for (let idx = 0; idx < sorted.length; idx++) {
    const tx = sorted[idx];
    const vout = tx.vout || [];
    if (vout.length < 2) continue;
    const total = vout.reduce((s, o) => s + (o.value || 0), 0);
    if (total <= 0) continue;

    // Single peeling model: identify largest output as change candidate
    const sortedOutputs = [...vout].map((o, i) => ({ value: o.value || 0, idx: i })).sort((a, b) => b.value - a.value);
    const largest = sortedOutputs[0];
    const remainderSum = total - largest.value;
    // In classic peel chain, largest output is 65-99% of total, remainder is peel(s)
    const largestRatio = largest.value / total;
    const smallOutputs = sortedOutputs.slice(1);

    // Value decay check: change should decrease over hops (no inflation)
    if (prevChangeValue !== null && largest.value > prevChangeValue * 1.02) {
      // Inflation break — not peeling
      // Don't reset count, just skip this tx
      continue;
    }

    let isPeelTx = false;
    let peelPct = 0;

    if (vout.length === 2) {
      const smaller = Math.min(vout[0].value || 0, vout[1].value || 0);
      const ratio = smaller / total;
      if (ratio >= 0.008 && ratio <= 0.45 && largestRatio >= 0.55) {
        isPeelTx = true;
        peelPct = ratio * 100;
      }
    } else {
      // Multi-output: one dominant change + 1-4 small peel outputs (common in automated sybling)
      const smallCount = smallOutputs.length;
      // Small outputs should be relatively similar (batch peels) or single peel
      const allSmallAreSmall = smallOutputs.every(o => (o.value / total) < 0.30);
      const dominantChange = largestRatio >= 0.60;
      if (dominantChange && allSmallAreSmall && smallCount <= 4) {
        // Check that small outputs are not dust-dominated
        const nonDustSmall = smallOutputs.filter(o => o.value >= 546);
        if (nonDustSmall.length > 0) {
          isPeelTx = true;
          peelPct = (remainderSum / total) * 100;
        }
      } else if (dominantChange && smallCount === 1 && remainderSum / total <= 0.45) {
        isPeelTx = true;
        peelPct = (remainderSum / total) * 100;
      }
    }

    if (isPeelTx) {
      peelingHopCount++;
      const pct = parseFloat(peelPct.toFixed(1));
      peelPercentages.push(pct);
      hopDetails.push({ txid: tx.txid || `idx_${idx}`, peelPct: pct, changeValue: largest.value, total });
      prevChangeValue = largest.value;
    }
  }

  const isPeeling = peelingHopCount >= 2;
  const avgPeel = peelPercentages.length > 0
    ? parseFloat((peelPercentages.reduce((a, b) => a + b, 0) / peelPercentages.length).toFixed(1))
    : 0;

  // Population std-dev of peel percentages, computed once and reused below
  const peelStdDev = peelPercentages.length > 1
    ? parseFloat((Math.sqrt(peelPercentages.reduce((s, v) => s + Math.pow(v - avgPeel, 2), 0) / peelPercentages.length)).toFixed(1))
    : 0;

  // Confidence: base 60 + hops, plus consistency bonus (low variance in peel %), plus decay consistency
  let confidence = 0;
  if (isPeeling) {
    const consistencyBonus = peelStdDev < 8 ? 12 : peelStdDev < 15 ? 6 : 0;
    const decayBonus = hopDetails.length >= 3 && hopDetails.every((h, i) => i === 0 || h.changeValue <= hopDetails[i - 1].changeValue) ? 8 : 0;
    confidence = Math.min(96, 58 + peelingHopCount * 9 + consistencyBonus + decayBonus);
  }

  return {
    isPeelingChain: isPeeling,
    hopCount: peelingHopCount,
    averagePeelPercent: avgPeel,
    confidence,
    details: { hops: hopDetails, variance: peelStdDev, stdDev: peelStdDev }
  };
}

/**
 * Normalizes input/output entries into objects with integer satoshi values.
 */
function normalizeSatsEntry(item, index, prefix) {
  if (typeof item === 'number') {
    return { id: `${prefix}_${index}`, valueSats: Math.round(item) };
  }
  if (!item) return { id: `${prefix}_${index}`, valueSats: 0 };
  const sats = typeof item.valueSats === 'number'
    ? Math.round(item.valueSats)
    : Math.round((parseFloat(item.value || 0) || 0) * 1e8);
  return {
    id: item.id || item.address || `${prefix}_${index}`,
    address: item.address || item.scriptpubkey_address || null,
    valueSats: sats,
    ...item
  };
}

/**
 * Knapsack / Subset-Sum CoinJoin Unmixing Solver
 *
 * In CoinJoin transactions (e.g. 2-party JoinMarket or Wasabi partial mixes),
 * participants pool inputs and receive equal-denomination mix outputs plus change.
 * 
 * Formula: sum(Inputs_p) = MixOutput_p + ChangeOutput_p + Fee_p
 *
 * By evaluating subset sums across inputs and outputs within plausible fee bounds,
 * this function reconstructs the constituent participants, breaking anonymity set sizes.
 *
 * @param {Object} params
 * @param {Array} params.inputs - Array of transaction inputs (sats or objects)
 * @param {Array} params.outputs - Array of transaction outputs (sats or objects)
 * @param {number} [params.maxFeeSats=35000] - Maximum plausible miner fee per participant
 * @param {number} [params.minFeeSats=100] - Minimum plausible miner fee per participant
 * @returns {Object} Unmixing breakdown with participant partitions and confidence score
 */
export function solveCoinJoinSubsetSum({
  inputs = [],
  outputs = [],
  maxFeeSats = 35000,
  minFeeSats = 100
}) {
  const normInputs = inputs.map((inp, idx) => normalizeSatsEntry(inp, idx, 'in'));
  const normOutputs = outputs.map((out, idx) => normalizeSatsEntry(out, idx, 'out'));

  if (normInputs.length < 2 || normOutputs.length < 2) {
    return {
      isCoinJoin: false,
      isSolvable: false,
      partitions: [],
      confidence: 0,
      summary: 'Insufficient inputs/outputs to perform CoinJoin subset-sum analysis.'
    };
  }

  // 1. Detect equal-denomination mix outputs
  const valueCounts = new Map();
  normOutputs.forEach(o => {
    if (o.valueSats > 546) {
      valueCounts.set(o.valueSats, (valueCounts.get(o.valueSats) || 0) + 1);
    }
  });

  let mixDenom = 0;
  let mixCount = 0;
  for (const [val, count] of valueCounts.entries()) {
    if (count >= 2 && count > mixCount) {
      mixDenom = val;
      mixCount = count;
    }
  }

  // If no identical mix outputs, check for general 2-party decomposition
  const mixOutputs = normOutputs.filter(o => o.valueSats === mixDenom);
  const changeOutputs = normOutputs.filter(o => o.valueSats !== mixDenom);

  // If no standard equal-value mix denomination found
  if (mixCount < 2) {
    return {
      isCoinJoin: false,
      isSolvable: false,
      mixDenominationSats: 0,
      mixOutputCount: 0,
      partitions: [],
      confidence: 0,
      summary: 'No uniform CoinJoin mix denomination identified among outputs.'
    };
  }

  // 2. Subset sum matching
  // Generate input subsets (bounded up to 20 inputs to prevent 2^N explosion)
  const boundedInputs = normInputs.slice(0, 16);
  const n = boundedInputs.length;
  const numSubsets = 1 << n;

  // Precompute sums for all input subsets (excluding empty set)
  const subsetSums = [];
  for (let mask = 1; mask < numSubsets; mask++) {
    let sum = 0;
    const subsetItems = [];
    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) !== 0) {
        sum += boundedInputs[i].valueSats;
        subsetItems.push(boundedInputs[i]);
      }
    }
    subsetSums.push({ mask, sum, items: subsetItems });
  }

  // For each mix output, find candidate (change, input-subset) pairs
  // Target: inputSubset.sum - (mixDenom + change.valueSats) in [minFeeSats, maxFeeSats]
  // Or without change (exact mix payment): inputSubset.sum - mixDenom in [minFeeSats, maxFeeSats]
  const candidateMatches = [];

  // Include a null change candidate (0 sats)
  const changeCandidates = [...changeOutputs, { id: 'no_change', valueSats: 0, isVirtual: true }];

  for (const change of changeCandidates) {
    const targetOut = mixDenom + change.valueSats;
    for (const sub of subsetSums) {
      const diff = sub.sum - targetOut;
      if (diff >= minFeeSats && diff <= maxFeeSats) {
        candidateMatches.push({
          change,
          mask: sub.mask,
          inputs: sub.items,
          inputSum: sub.sum,
          fee: diff,
          targetOut
        });
      }
    }
  }

  // 3. Find disjoint combination of candidate matches covering the mix outputs
  // Backtracking search for disjoint input masks
  let bestPartition = null;
  let partitionCount = 0;

  function findDisjointPartitions(startIndex, currentPartitions, usedMask, usedChanges) {
    if (currentPartitions.length === mixCount) {
      partitionCount++;
      if (!bestPartition) {
        bestPartition = [...currentPartitions];
      }
      return;
    }

    for (let i = startIndex; i < candidateMatches.length; i++) {
      const candidate = candidateMatches[i];
      // Check if inputs overlap
      if ((usedMask & candidate.mask) !== 0) continue;
      // Check if real change output is reused
      if (!candidate.change.isVirtual && usedChanges.has(candidate.change.id)) continue;

      const nextChanges = new Set(usedChanges);
      if (!candidate.change.isVirtual) nextChanges.add(candidate.change.id);

      findDisjointPartitions(
        i + 1,
        [...currentPartitions, candidate],
        usedMask | candidate.mask,
        nextChanges
      );

      if (partitionCount > 10) break; // Bounded ambiguity check
    }
  }

  findDisjointPartitions(0, [], 0, new Set());

  if (!bestPartition || bestPartition.length === 0) {
    return {
      isCoinJoin: true,
      isSolvable: false,
      mixDenominationSats: mixDenom,
      mixOutputCount: mixCount,
      partitions: [],
      confidence: 30,
      summary: `Identified CoinJoin structure with ${mixCount} equal outputs of ${(mixDenom / 1e8).toFixed(4)} BTC, but input subsets could not be unambiguously decomposed.`
    };
  }

  // Format final partitions
  const formattedPartitions = bestPartition.map((part, pIdx) => {
    const mixObj = mixOutputs[pIdx] || { id: `mix_out_${pIdx}`, valueSats: mixDenom };
    const hasChange = !part.change.isVirtual;
    return {
      participantIndex: pIdx + 1,
      inputIds: part.inputs.map(i => i.id),
      inputs: part.inputs,
      totalInputSats: part.inputSum,
      totalInputBtc: (part.inputSum / 1e8).toFixed(6),
      mixOutput: mixObj,
      changeOutput: hasChange ? part.change : null,
      estimatedFeeSats: part.fee,
      confidence: partitionCount === 1 ? 92 : partitionCount <= 3 ? 74 : 58
    };
  });

  const isUniqueSolution = partitionCount === 1;
  const overallConfidence = isUniqueSolution ? 92 : partitionCount <= 3 ? 75 : 55;

  return {
    isCoinJoin: true,
    isSolvable: true,
    mixDenominationSats: mixDenom,
    mixOutputCount: mixCount,
    participantCount: formattedPartitions.length,
    partitions: formattedPartitions,
    isUniqueSolution,
    solutionCount: partitionCount,
    confidence: overallConfidence,
    anonymitySetReduction: {
      original: mixCount,
      effective: isUniqueSolution ? 1 : Math.min(mixCount, partitionCount)
    },
    summary: isUniqueSolution
      ? `De-anonymized ${formattedPartitions.length} participant sub-clusters with 92% confidence, collapsing anonymity set from ${mixCount} to 1.`
      : `Partially de-anonymized ${formattedPartitions.length} participant sub-clusters (${partitionCount} possible combinations identified, ~${overallConfidence}% confidence).`
  };
}
