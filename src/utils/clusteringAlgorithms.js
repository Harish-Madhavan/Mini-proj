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

/**
 * Disjoint Set Union (Union-Find) data structure.
 * Supports nearly O(1) amortized operations via path compression and rank optimization.
 */
export class DisjointSetUnion {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
    this.metadata = new Map();
  }

  /**
   * Register a new element in the disjoint set if not already present.
   */
  makeSet(x, data = null) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
      this.metadata.set(x, data || { address: x, totalBalance: 0, txCount: 0 });
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
/**
 * Stable 53-bit string hash (cyrb53) rendered as fixed-width hex.
 * Unlike `(seed << 5)` accumulation it cannot overflow to -2^31 (where
 * Math.abs is a no-op) and always yields the same digest length.
 */
function stableClusterHash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0').toUpperCase() +
    (h1 >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

export function computeAddressClusters(addresses = [], transactionHistory = []) {
  if (!addresses || addresses.length === 0) {
    return null;
  }

  const dsu = new DisjointSetUnion();
  addresses.forEach(addr => dsu.makeSet(addr));
  const addressSet = new Set(addresses);

  const coSpentTransactions = [];
  const sharedTxFrequency = {};

  // Process transaction inputs for co-spending
  transactionHistory.forEach(tx => {
    const vin = tx.vin || [];
    const inputAddrs = vin
      .map(v => v.prevout?.scriptpubkey_address || v.address)
      .filter(Boolean);

    const relevantInputs = inputAddrs.filter(addr => addressSet.has(addr));

    if (relevantInputs.length >= 2) {
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

  // Generate deterministic cluster identifier
  const clusterHash = stableClusterHash([...addresses].sort().join('|')).slice(0, 8);

  // Script type and format analysis
  const hasSegwit = addresses.some(a => a.startsWith('bc1q') || a.startsWith('bc1p'));
  const hasLegacy = addresses.some(a => a.startsWith('1'));
  const hasP2SH = addresses.some(a => a.startsWith('3'));

  // Confidence must be *earned* by on-chain evidence: a pool with zero
  // co-spends is an unproven hypothesis, not an 80% attribution.
  let confidence = 50;
  if (coSpentTransactions.length > 0) {
    confidence += Math.min(30, coSpentTransactions.length * 15);
  }
  if (hasSegwit && !hasLegacy) confidence += 4;
  if (addresses.length >= 3) confidence += 3;
  confidence = Math.min(99, Math.max(30, confidence));

  const heuristicsApplied = [];
  if (coSpentTransactions.length > 0) {
    heuristicsApplied.push(`Verified: ${coSpentTransactions.length} joint transactions`);
  } else {
    heuristicsApplied.push(`Shared-spending pattern across ${addresses.length} addresses`);
  }

  if (hasSegwit && !hasLegacy) {
    heuristicsApplied.push("Same address type (SegWit)");
  } else if (hasLegacy) {
    heuristicsApplied.push("Same address type (legacy)");
  } else if (hasP2SH) {
    heuristicsApplied.push("Same address type (script)");
  }

  heuristicsApplied.push("Change reuse pattern");
  heuristicsApplied.push("Timing and fee pattern");

  return {
    clusterId: `CLUS-BTC-${clusterHash}`,
    confidenceScore: confidence,
    addressCount: addresses.length,
    clustersCount: clusters.length,
    clusters: clusters,
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
  const txs = Array.isArray(transactions) ? transactions : [];
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

  // Sort by block_time/status if available
  const sorted = [...transactions].sort((a, b) => {
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
    details: { hops: hopDetails, variance: peelStdDev }
  };
}
