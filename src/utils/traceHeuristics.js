/**
 * AegisTrace Trace Heuristics Engine — Weighted multi-factor change vs payment classification
 *
 * Each output is scored on 7 orthogonal signals. Higher positive score => likely PAYMENT (end receiver),
 * negative score => likely CHANGE (continue tracing). Threshold tunable, confidence derived from margin + hop decay.
 *
 * Heuristics implemented (weights tuned against labeled mainnet transactions;
 * measured per-hop accuracy and coverage live in accuracy.js — run `npm run verify`):
 *  H1: Script Type Consistency (20%) — wallets reuse script type for change (BIP69 / wallet fingerprint)
 *  H2: Address Reuse & Freshness (18%) — change goes to fresh address, payment often reused but not always
 *  H3: Value Roundness & Amount Pattern (18%) — payments often round (e.g. 0.1 BTC), change is "dusty remainder"
 *  H4: Output Position / Wallet Fingerprint (12%) — many wallets order change last (BIP69) or first; weight light
 *  H5: Spent Status + Dwell Behavior (18%) — unspent = terminal; spent+dwelled =
 *      recipient action (neutral); spent within ~a day = change sweep (transit)
 *  H6: Transaction Fingerprint (8%) — 1-in-2-out peel vs batch dispersal vs many-in-many CoinJoin structure
 *       (single-output shape is owned by H8, not fingerprinted as "consolidation")
 *  H7: Fee Market Context (6%) — post-2015 fee rates only; pre-fee-market eras skip this signal
 *  H8: Single-Output Address Identity (shares H2 budget) — one value-bearing output cannot be
 *      "change alongside a payment". Identity is decisive: back to an input address =>
 *      self-consolidation (change); anywhere else => payment. Fresh output => high
 *      confidence (cf. May-2010 10,000 BTC pizza purchase: 131 inputs, one fresh
 *      round output); previously-seen output => tempered (possible change-address reuse).
 *  H9: Chain Reuse (shares H2 budget, tracing only) — needs pre-fetched address
 *      summaries. An output address funded twice or more on-chain predates this
 *      transaction; change addresses are almost never reused, so reuse leans
 *      payment. One-time-funded or unknown addresses stay neutral: H2/H8 own
 *      freshness, and funded_txo_count (not tx_count) avoids mistaking a
 *      fund-once/spend-once lifecycle for reuse.
 *
 * Also exports: checkValueConservation, isDustOutput, exchangeDepositConfidence, computeTraceConfidence
 */

import { TRACE_CONFIG as CENTRAL_TRACE_CONFIG, BITCOIN_CONSTANTS } from '../constants/config';
import { txFeeRateSatVb } from './clusteringAlgorithms';
export const DUST_THRESHOLD_SATS = BITCOIN_CONSTANTS.DUST_THRESHOLD_SATS;
export const TRACE_CONFIG = CENTRAL_TRACE_CONFIG;

/**
 * Check if satoshi value looks "round" (likely human-specified payment) vs remainder change.
 * Uses integer satoshi arithmetic only — floating-point BTC multiplication
 * (e.g. 0.07 * 100 === 7.000000000001) misclassifies near-round values.
 */
export function isRoundValue(sats) {
  if (!Number.isFinite(sats) || sats <= 0 || !Number.isInteger(sats)) return false;
  // Four trailing zeros covers every tier (100k sats ⊃ 0.001 BTC and up)
  return sats % 10000 === 0 && String(sats).endsWith('0000');
}

/**
 * Weighted heuristic scorer for a single output in context of its transaction
 * @param {Object} params - { tx, outputIndex, inputScriptTypes, outspends, seenAddresses }
 * @returns {{ score: number, confidence: number, breakdown: object, isChangeCandidate: boolean, isPaymentCandidate: boolean }}
 */
/**
 * Start of the modern fee market: before ~2015-01-01 there was no sat/vB fee
 * market, so absolute fee-rate thresholds (80 sat/vB "urgent", <2 "uneconomic")
 * misread historic transactions (e.g. a 2010 tx paying 0.99 BTC fee over a tiny
 * vsize reads as 4000+ sat/vB "urgent"). H7 is skipped for older blocks.
 */
export const FEE_MARKET_GENESIS_TIME = 1420070400;

export function scoreOutputHeuristics({ tx, outputIndex, inputScriptTypes, outspends, seenAddresses, outputId = null, addressMeta = null }) {
  const outputs = tx.vout || [];
  const output = outputs[outputIndex];
  if (!output) return { score: 0, confidence: 0, breakdown: {}, isChangeCandidate: false, isPaymentCandidate: false };

  const scriptType = output.scriptpubkey_type || '';
  const address = output.scriptpubkey_address || null;
  const value = output.value || 0;
  const outspend = outspends[outputIndex] || {};
  const isSpent = outspend.spent === true;

  // Shared context: input identity keys (address or bare pubkey) and the set
  // of value-bearing outputs. H8 fires only for the single value-bearing
  // output (OP_RETURN / zero-value carriers can never be change OR payment).
  const inputIdentityKeys = (tx.vin || []).map(v => getIdentityKey(v.prevout)).filter(Boolean);
  const outputIdentityKey = getIdentityKey(output);
  const valueOutputs = outputs.filter(o => (o.value || 0) > 0);
  const isSoleValueOutput = value > 0 && valueOutputs.length === 1 && valueOutputs[0] === output;

  // --- H1: Script Type Consistency (wallet usually matches change type) ---
  let scriptScore = 0;
  if (inputScriptTypes && inputScriptTypes.length > 0) {
    // Majority vote over NORMALIZED input types — display names and raw
    // esplora types are mapped into the heuristic key space first.
    const normalizedInputs = inputScriptTypes.map(normalizeScriptKey);
    const freq = normalizedInputs.reduce((a, t) => { a[t] = (a[t] || 0) + 1; return a; }, {});
    const majorityType = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const outputScript = scriptKeyOf(address, scriptType);
    const otherOutputsDifferent = outputs.some((o, idx) => {
      if (idx === outputIndex) return false;
      return scriptKeyOf(o.scriptpubkey_address || '', o.scriptpubkey_type || '') !== majorityType;
    });
    if (outputScript === majorityType && otherOutputsDifferent) {
      scriptScore = -3.0; // likely change (matches wallet)
    } else if (outputScript !== majorityType) {
      scriptScore = 2.5; // likely payment (foreign script)
    } else {
      scriptScore = 0; // ambiguous
    }
  }

  // --- H2: Address reuse / freshness ---
  let reuseScore = 0;
  if (address) {
    if (seenAddresses && seenAddresses.has(address)) {
      reuseScore = 1.5; // seen before -> more likely payment/exchange reuse
    } else if (outputs.length === 2) {
      // Fresh change addresses are usually new; payment may be known exchange
      reuseScore = -0.5;
    }
  }
  // Self-transfer detection (outside the address gate: bare-pubkey outputs
  // have no address). Output reusing any input identity (address or pubkey)
  // => definitely change. Pubkey comparison rescues 2009-era P2PK flows where
  // no addresses exist at all.
  if (outputIdentityKey && inputIdentityKeys.includes(outputIdentityKey)) {
    reuseScore = -5.0; // strong change signal (self transfer)
  }

  // --- H3: Value roundness ---
  let roundnessScore = 0;
  if (isRoundValue(value)) {
    roundnessScore = 2.0; // round => payment
  } else if (value < DUST_THRESHOLD_SATS) {
    roundnessScore = -1.0; // dust unlikely payment
  } else if (outputs.length === 2) {
    const otherVal = outputs[1 - outputIndex]?.value || 0;
    const total = value + otherVal;
    // In a 2-output peel the smaller output is usually the peeled payment
    // and the larger remainder is the change going back to the sender wallet.
    // NOTE: share must be value/total — min/total can never exceed 0.5, so a
    // min-based "dominant remainder" test is dead code (cf. 2017 ransom peel
    // 2b22df65: 9.02 BTC change beside a 0.003 BTC peel would never trigger).
    if (total > 0) {
      const share = value / total;
      if (value < otherVal && share < 0.3) {
        // Extreme peels (<5% sliver beside a dominant remainder, cf. ransom
        // splits) score stronger: a fast dwell alone must not flip them into
        // confident change when the shape screams payment.
        roundnessScore = share < 0.05 ? 2.0 : 1.2; // small peel payment
      } else if (value > otherVal && share > 0.7) {
        roundnessScore = -1.5; // dominant remainder is change
      }
    }
  }

  // --- H4: Output index / BIP69 ---
  let positionScore = 0;
  if (outputs.length === 2) {
    // BIP69: lexicographic ordering; change often last. Weak signal, weight low.
    if (outputIndex === 0) positionScore = -0.3;
    else positionScore = 0.3;
  } else if (outputs.length > 2) {
    // Multi-output batch payments: all but one change are payments; change often smallest
    const sortedByValue = [...outputs].map((o, i) => ({ i, v: o.value || 0 })).sort((a, b) => a.v - b.v);
    const isSmallest = sortedByValue[0].i === outputIndex;
    if (isSmallest && value < (outputs.reduce((s, o) => s + (o.value || 0), 0) / outputs.length)) positionScore = -0.8;
  }

  // --- H5: Spent status + dwell behavior ---
  // A spent output's dwell (parent block -> spender block) separates change
  // sweeps (spent in the wallet's very next tx) from real payments (dwelling
  // in the recipient's wallet — the spend is the RECIPIENT's later action, so
  // the transit penalty is lifted). Cf. Jan-2009 first-ever tx: 40 BTC change
  // swept 11 blocks later, 10 BTC payment dwelled 92,070 blocks.
  let spentScore = 0;
  let dwellBlocks = null;
  if (!isSpent) {
    spentScore = 3.5; // unspent terminal -> strong payment/UTXO signal
  } else {
    spentScore = -1.0;
    dwellBlocks = getSpendDwellBlocks(tx, outspend);
    if (dwellBlocks != null) {
      if (dwellBlocks <= QUICK_SPEND_BLOCKS) spentScore = -2.0; // fast sweep — change-leaning
      else if (dwellBlocks >= LONG_DWELL_BLOCKS) spentScore = 0.0; // dwelled — recipient action, neutral
    }
  }

  // --- H6: Transaction fingerprint ---
  let fingerprintScore = 0;
  const vinLen = (tx.vin || []).length;
  const voutLen = outputs.length;
  if (vinLen === 1 && voutLen === 2) {
    // Classic peel one-to-two — neutral (both handled by other heuristics), but slightly favors change detection
    fingerprintScore = 0;
  } else if (vinLen === 1 && voutLen > 2) {
    // Batch peel / dispersal — small outputs are payments, largest is change
    if (voutLen <= 5 && value < (outputs.reduce((s, o) => s + (o.value || 0), 0) / voutLen)) fingerprintScore = 1.0;
    else if (value === Math.max(...outputs.map(o => o.value || 0))) fingerprintScore = -1.2;
  } else if (vinLen >= 2 && voutLen >= 3) {
    // Many-to-many may be CoinJoin or payjoin — penalize confidence, handled elsewhere for CoinJoin
    fingerprintScore = 0.2;
  }

  // --- H7: Fee context (modern fee market only) ---
  let feeScore = 0;
  const blockTime = tx.status?.block_time;
  const feeEraApplies = blockTime == null || blockTime >= FEE_MARKET_GENESIS_TIME;
  if (feeEraApplies) {
    const feeRate = txFeeRateSatVb(tx);
    if (feeRate != null) {
      if (feeRate > 80) feeScore = 0.8; // high fee manual bump — payment may be urgent
      else if (feeRate < 2 && tx.status?.confirmed) feeScore = -0.6; // uneconomic low fee — likely change consolidation with low priority
    }
  }

  // --- H8: Single-output address identity (decisive, shares H2's weight budget) ---
  // With one value-bearing output there is no payment/change split to infer —
  // identity decides. Back to a funder address => self-consolidation (change);
  // a fresh address => payment (nothing else the funds could be). A previously
  // seen (but non-input) address is tempered: likely payment, but compatible
  // with change-address reuse, so confidence stays modest.
  let identityScore = 0;
  let identityStrength = null; // 'decisive' | 'tempered' | null
  if (isSoleValueOutput && outputIdentityKey) {
    if (inputIdentityKeys.includes(outputIdentityKey)) {
      identityScore = -4.0; // self-consolidation — change by construction
      identityStrength = 'decisive';
    } else {
      // Freshness via the classifier's identifier (real address or P2PK
      // pseudo-id); falls back to decisive when no address index exists.
      const seenKey = outputId || address;
      if (seenKey && seenAddresses && seenAddresses.has(seenKey)) {
        identityScore = 1.5; // sole output to a known address — payment, tempered
        identityStrength = 'tempered';
      } else {
        identityScore = 4.0; // sole output to a fresh identity — payment by construction
        identityStrength = 'decisive';
      }
    }
  }

  // --- H9: Chain reuse (pre-fetched address summaries, tracing only) ---
  let chainReuseScore = 0;
  const fundedCount = address ? addressMeta?.get?.(address)?.chain_stats?.funded_txo_count : undefined;
  if (Number.isFinite(fundedCount) && fundedCount >= 2) {
    chainReuseScore = 1.2; // known-before-this-tx address — payment-leaning
  }

  // Weighted aggregate (H8/H9 share the address-identity budget with H2)
  const weights = { script: 0.20, reuse: 0.18, roundness: 0.18, position: 0.12, spent: 0.18, fingerprint: 0.08, fee: 0.06 };
  const weightedScore =
    scriptScore * (weights.script * 4) +
    reuseScore * (weights.reuse * 4) +
    roundnessScore * (weights.roundness * 4) +
    positionScore * (weights.position * 4) +
    spentScore * (weights.spent * 4) +
    fingerprintScore * (weights.fingerprint * 4) +
    feeScore * (weights.fee * 4) +
    identityScore * (weights.reuse * 4) +
    chainReuseScore * (weights.reuse * 4);

  const hopDecay = Math.max(0.75, 1 - (typeof tx._traceDepth === 'number' ? tx._traceDepth * 0.07 : 0));
  let confidence = Math.min(0.95, (Math.abs(weightedScore) / 8) * hopDecay);
  // Identity-decisive outcomes are near-deterministic accounting, not a
  // behavioral guess — floor their confidence instead of letting the /8 norm
  // dilute them into ambiguity.
  if (identityStrength === 'decisive') confidence = Math.max(confidence, 0.85);
  else if (identityStrength === 'tempered') confidence = Math.max(confidence, 0.6);
  const breakdown = {
    scriptScore: parseFloat(scriptScore.toFixed(2)),
    reuseScore: parseFloat(reuseScore.toFixed(2)),
    roundnessScore: parseFloat(roundnessScore.toFixed(2)),
    positionScore: parseFloat(positionScore.toFixed(2)),
    spentScore: parseFloat(spentScore.toFixed(2)),
    fingerprintScore: parseFloat(fingerprintScore.toFixed(2)),
    feeScore: parseFloat(feeScore.toFixed(2)),
    identityScore: parseFloat(identityScore.toFixed(2)),
    chainReuseScore: parseFloat(chainReuseScore.toFixed(2)),
    dwellBlocks,
    weightedScore: parseFloat(weightedScore.toFixed(2)),
  };

  return {
    score: parseFloat(weightedScore.toFixed(2)),
    confidence,
    breakdown,
    weightedScore: parseFloat(weightedScore.toFixed(2)),
    isChangeCandidate: weightedScore < -1.0,
    isPaymentCandidate: weightedScore > 1.0,
  };
}

/**
 * Canonical script-type key from an address and/or raw script type string.
 * Single taxonomy for the whole app: display names are derived from these
 * keys (see getScriptTypeFromAddress), and heuristic inputs normalize into
 * them. Order preserves the legacy classifier behavior exactly.
 */
export function scriptKeyOf(address, scriptType = '') {
  if (!address && !scriptType) return 'unknown';
  if (scriptType === 'p2pk' || (address && address.includes('P2PK'))) return 'p2pk';
  if (address?.startsWith('bc1p') || scriptType === 'v1_p2tr') return 'p2tr';
  if (address?.startsWith('bc1q') && address?.length > 50) return 'p2wsh';
  if (address?.startsWith('bc1q') || scriptType === 'v0_p2wpkh') return 'p2wpkh';
  if (address?.startsWith('3') || scriptType === 'p2sh') return 'p2sh';
  if (address?.startsWith('1') || scriptType === 'p2pkh') return 'p2pkh';
  if (scriptType === 'op_return') return 'op_return';
  if (scriptType === 'multisig') return 'multisig';
  return normalizeScriptKey(scriptType || 'unknown');
}

/**
 * Normalize a script-type label to the heuristic key space. Labels arrive as
 * current or legacy DISPLAY names, or RAW esplora types ("v0_p2wpkh").
 * Normalizing both sides of H1 through one funnel is what keeps the change
 * branch reachable — comparing across taxonomies never matches.
 */
export function normalizeScriptKey(label) {
  if (!label || typeof label !== 'string') return 'unknown';
  const t = label.trim();
  const HEURISTIC_KEYS = new Set(['p2pk', 'p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'p2tr', 'multisig', 'op_return', 'unknown']);
  if (HEURISTIC_KEYS.has(t)) return t;
  const DISPLAY_MAP = {
    'Early public key (P2PK)': 'p2pk',
    'Legacy': 'p2pkh',
    'Script address (P2SH)': 'p2sh',
    'Native SegWit': 'p2wpkh',
    'SegWit script': 'p2wsh',
    'Taproot (P2TR)': 'p2tr',
    'Shared signatures': 'multisig',
    'Embedded data': 'op_return',
    // Legacy display names (pre-plain-words UI + persisted sessions)
    'Pay-to-PubKey (Legacy P2PK)': 'p2pk',
    'Legacy (P2PKH)': 'p2pkh',
    'Pay-to-Script-Hash (P2SH Multi-sig)': 'p2sh',
    'Native SegWit (v0 P2WPKH)': 'p2wpkh',
    'SegWit Script (v0 P2WSH)': 'p2wsh',
    'Taproot (P2TR / Bech32m)': 'p2tr',
    'Bare Multi-Sig (P2MS)': 'multisig',
    'OP_RETURN (Null Data)': 'op_return',
  };
  if (DISPLAY_MAP[t]) return DISPLAY_MAP[t];
  const RAW_MAP = {
    v0_p2wpkh: 'p2wpkh', v0_p2wsh: 'p2wsh', v1_p2tr: 'p2tr',
    p2pkh: 'p2pkh', p2sh: 'p2sh', p2pk: 'p2pk', op_return: 'op_return', multisig: 'multisig',
  };
  return RAW_MAP[t] || t;
}

/**
 * Extract the full public key hex from a P2PK output/prevout.
 * Bare-pubkey scripts predate addresses entirely (2009-era chain), so the
 * pubkey itself is the only identity available. Handles Blockstream/Electrs
 * ASM (`OP_PUSHBYTES_65 <hex> OP_CHECKSIG`) and raw hex templates
 * (`41<65-byte>ac` / `21<33-byte>ac`). Returns lowercase hex or null.
 */
export function extractTxPubkey(scriptObj) {
  if (!scriptObj) return null;
  const asm = scriptObj.scriptpubkey_asm || '';
  const asmMatch = asm.match(/(?:OP_PUSHBYTES_\d+\s+)?([0-9a-fA-F]{66}|[0-9a-fA-F]{130})\s+OP_CHECKSIG/);
  if (asmMatch) return asmMatch[1].toLowerCase();
  const hex = scriptObj.scriptpubkey || '';
  const hexMatch = hex.match(/^(?:41)([0-9a-fA-F]{130})(?:ac)$/) || hex.match(/^(?:21)([0-9a-fA-F]{66})(?:ac)$/);
  if (hexMatch) return hexMatch[1].toLowerCase();
  return null;
}

/**
 * Identity key for change/payment matching: the address when present,
 * otherwise the bare pubkey (namespaced so key spaces can never collide).
 * Lets 2009-era P2PK flows use the same identity logic as modern addresses.
 */
export function getIdentityKey(scriptObj) {
  if (!scriptObj) return null;
  if (scriptObj.scriptpubkey_address) return scriptObj.scriptpubkey_address;
  const pubkey = extractTxPubkey(scriptObj);
  return pubkey ? `pubkey:${pubkey}` : null;
}

/**
 * Spend dwell: how many blocks after the parent an output was spent, from
 * outspend status heights. Change sweeps move fast (next wallet tx); real
 * payments dwell in the recipient's wallet. Null when either height is
 * unknown (mempool/unconfirmed) — the signal is skipped, never guessed.
 */
export function getSpendDwellBlocks(tx, outspend) {
  const parentHeight = tx?.status?.block_height;
  const spendHeight = outspend?.status?.block_height;
  if (!Number.isInteger(parentHeight) || !Number.isInteger(spendHeight)) return null;
  const delta = spendHeight - parentHeight;
  return delta >= 0 ? delta : null;
}

/** Dwell thresholds in blocks (~144/day): swept within a day vs dwelled a week+. */
export const QUICK_SPEND_BLOCKS = 144;
export const LONG_DWELL_BLOCKS = 1008;

/**
 * Validate value conservation: sum(inputs) == sum(outputs) + fee (±1 sat for rounding)
 */
export function checkValueConservation(tx) {
  const inputSum = (tx.vin || []).reduce((s, v) => s + (v.prevout?.value || 0), 0);
  const outputSum = (tx.vout || []).reduce((s, o) => s + (o.value || 0), 0);
  const fee = tx.fee || 0;
  if (inputSum === 0) return { valid: true, delta: 0, reason: 'coinbase (no inputs)' };
  const delta = inputSum - outputSum - fee;
  const valid = Math.abs(delta) <= 1;
  return {
    valid,
    delta,
    inputSum,
    outputSum,
    fee,
    reason: valid ? 'Conservation holds' : `Mismatch: inputs ${inputSum} != outputs ${outputSum} + fee ${fee} (delta ${delta})`,
  };
}

/**
 * Exchange deposit heuristic — P2SH multisig and Taproot script paths are the
 * strong custodial signals. Plain 42-char P2WPKH (bc1q) is the default
 * self-custody format, so it scores nothing on its own and needs corroboration
 * (P2WSH length or an unspent long-dwell UTXO) before counting as custodial.
 * Returns confidence 0..1 that address is custodial.
 */
export function exchangeDepositConfidence(address, scriptType, outspend) {
  if (!address) return 0;
  let score = 0;
  if (scriptType === 'p2sh' || address.startsWith('3')) score += 0.35;
  if (scriptType === 'v1_p2tr' || address.startsWith('bc1p')) score += 0.40;
  // P2WSH (62-char bc1q) script-hash custodial vaults score weakly; plain
  // P2WPKH single-sig does not — it is the standard self-custody format.
  if (address.startsWith('bc1q') && address.length === 62) score += 0.15;
  // Custodial deposits dwell unspent; change is usually swept quickly
  if (outspend && outspend.spent === false) score += 0.15;
  return Math.min(0.95, score);
}

/**
 * Compute overall trace confidence by averaging per-hop confidence, penalizing ambiguous hops and depth decay
 */
export function computeTraceConfidence(heuristicsList = []) {
  if (!heuristicsList.length) return { confidence: 0.5, level: 'LOW', ambiguousCount: 0 };
  const avg = heuristicsList.reduce((s, h) => s + (h.confidence || 0.5), 0) / heuristicsList.length;
  const ambiguous = heuristicsList.filter(h => Math.abs(h.score) < 1.0).length;
  const decay = Math.max(0.7, 1 - heuristicsList.length * 0.06); // longer chains less certain
  // Cap the ambiguity penalty so long traces bottom out at a floored discount
  // instead of flipping the factor negative (7+ ambiguous hops => 1-1.05 < 0).
  const ambiguityFactor = Math.max(0.4, 1 - ambiguous * 0.12);
  const penalized = avg * ambiguityFactor * decay;
  const confidence = Math.max(0.1, Math.min(0.98, penalized));
  let level = 'HIGH';
  if (confidence < 0.55) level = 'LOW';
  else if (confidence < 0.75) level = 'MEDIUM';
  return { confidence: parseFloat(confidence.toFixed(2)), level, ambiguousCount: ambiguous, rawAvg: parseFloat(avg.toFixed(2)) };
}

/**
 * Detect dust outputs that should be ignored for tracing (not economically traceable)
 */
export function isDustOutput(value) {
  return Number.isFinite(value) && value > 0 && value < DUST_THRESHOLD_SATS;
}

/**
 * UTXO age in blocks/days for detail display. Approx if tx is confirmed.
 * Returns { blocks, days, label } or null if mempool/unconfirmed.
 */
export function getUtxoAgeInfo(tx, nowMs = Date.now()) {
  const bh = tx?.status?.block_height;
  const bt = tx?.status?.block_time;
  if (!bh || !bt) return null;
  const nowSec = Math.floor(nowMs / 1000);
  const ageSec = Math.max(0, nowSec - bt);
  const days = Math.floor(ageSec / 86400);
  const hours = Math.floor((ageSec % 86400) / 3600);
  // Approx blocks = days*144 + hours*6 (6 blocks per hour)
  const blocks = days * 144 + hours * 6;
  let label = '';
  if (days > 365) label = `${(days/365).toFixed(1)}y (${blocks} blocks)`;
  else if (days > 0) label = `${days}d ${hours}h (${blocks} blocks)`;
  else label = `${hours}h (${blocks} blocks)`;
  return { blocks, days, hours, ageSec, label };
}

/**
 * Fee tier label for detail display
 */
export function getFeeTier(feeRateSatVb) {
  const { FEE_TIER_LOW, FEE_TIER_AVG, FEE_TIER_HIGH } = BITCOIN_CONSTANTS;
  const n = parseFloat(feeRateSatVb);
  if (!Number.isFinite(n)) return { label: 'unknown', color: 'var(--text-muted)' };
  if (n < FEE_TIER_LOW) return { label: 'Low fee', color: '#10b981', detail: 'Economical / slow' };
  if (n <= FEE_TIER_AVG) return { label: 'Average fee', color: 'var(--text-secondary)', detail: 'Normal priority' };
  if (n <= FEE_TIER_HIGH) return { label: 'High fee', color: '#f59e0b', detail: 'Expedited' };
  return { label: 'Very high fee', color: '#ef4444', detail: 'Urgent' };
}
