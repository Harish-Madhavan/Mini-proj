import { API_CONFIG } from '../constants/config';
import { calculateCoinJoinEntropy } from './clusteringAlgorithms';
import {
  scoreOutputHeuristics,
  checkValueConservation,
  exchangeDepositConfidence,
  computeTraceConfidence,
  isDustOutput,
  extractTxPubkey,
  getSpendDwellBlocks,
  QUICK_SPEND_BLOCKS,
  LONG_DWELL_BLOCKS,
  TRACE_CONFIG,
  DUST_THRESHOLD_SATS,
} from './traceHeuristics';
import { buildTxHubNode, buildInputNode, buildOpReturnNode, buildOutputNode } from './graphBuilders';

export const apiCache = new Map();

export function clearCache() {
  apiCache.clear();
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(tid);
  }
}

async function fetchWithFallbackAndCache(endpoint) {
  if (!endpoint || typeof endpoint !== 'string' || endpoint.length > 200) {
    throw new Error('Invalid API endpoint');
  }
  const cacheKey = endpoint;
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < API_CONFIG.CACHE_TTL_MS) {
    apiCache.delete(cacheKey);
    apiCache.set(cacheKey, cached);
    return cached.data;
  }

  const urls = [
    `${API_CONFIG.PRIMARY_BASE_URL}${endpoint}`,
    `${API_CONFIG.FALLBACK_BASE_URL}${endpoint}`
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url);
      if (response.ok) {
        const data = await response.json();
        if (apiCache.size >= API_CONFIG.MAX_CACHE_SIZE) {
          const oldestKey = apiCache.keys().next().value;
          if (oldestKey) apiCache.delete(oldestKey);
        }
        apiCache.set(cacheKey, { timestamp: Date.now(), data });
        return data;
      } else if (response.status === 429) {
        lastError = new Error('Rate limited (429) - try again shortly');
      } else {
        lastError = new Error(`HTTP ${response.status} for ${endpoint}`);
      }
    } catch (err) {
      lastError = err.name === 'AbortError' ? new Error(`Request timeout for ${endpoint}`) : err;
    }
  }

  throw new Error(lastError ? lastError.message : `Failed to fetch data for ${endpoint}`);
}

export async function fetchTx(txId) {
  if (!/^[0-9a-fA-F]{64}$/.test(txId)) throw new Error('Invalid txId format');
  return fetchWithFallbackAndCache(`/tx/${txId}`);
}

export async function fetchOutspends(txId) {
  if (!/^[0-9a-fA-F]{64}$/.test(txId)) throw new Error('Invalid txId format');
  return fetchWithFallbackAndCache(`/tx/${txId}/outspends`);
}

export async function fetchAddressTxs(address) {
  if (!address || typeof address !== 'string' || address.length > 100) throw new Error('Invalid address');
  return fetchWithFallbackAndCache(`/address/${address}/txs`);
}

/**
 * Chain + mempool stats for one address (funded/spent sums and counts).
 * Cached like all gateway reads; powers end-receiver endpoint profiling.
 */
export async function fetchAddressSummary(address) {
  if (!address || typeof address !== 'string' || address.length > 100) throw new Error('Invalid address');
  return fetchWithFallbackAndCache(`/address/${address}`);
}

/**
 * Classify what KIND of endpoint an address is from its on-chain footprint.
 * Pure function of the /address summary: no network, fully testable.
 *
 * Profiles: SINGLE_USE_DEPOSIT (funded once or twice, never spent — the
 * classic one-time deposit / ransom drop), DRAINED_PASS_THROUGH (everything
 * received has moved on — follow the spends, not this address),
 * ACTIVE_REUSED_WALLET (ongoing two-way activity), DORMANT_HOLDER (funded,
 * unspent, but the funding is old/multi-tx), UNPROFILED (no data).
 * isAggregator flags addresses that absorbed 5+ separate funding outputs —
 * consolidation points worth clustering regardless of profile.
 */
export function classifyEndpointActivity(summary) {
  const empty = { profile: 'UNPROFILED', txCount: 0, totalReceivedSats: 0, balanceSats: 0, isAggregator: false };
  const chain = summary?.chain_stats;
  if (!chain) return empty;
  const fundedCount = chain.funded_txo_count || 0;
  const fundedSum = chain.funded_txo_sum || 0;
  const spentSum = chain.spent_txo_sum || 0;
  const txCount = chain.tx_count || 0;
  const balance = Math.max(0, fundedSum - spentSum);
  const base = {
    txCount,
    totalReceivedSats: fundedSum,
    balanceSats: balance,
    isAggregator: fundedCount >= 5,
  };
  if (fundedCount === 0) return { ...base, profile: 'UNPROFILED' };
  if (balance === 0) return { ...base, profile: 'DRAINED_PASS_THROUGH' };
  if (fundedCount <= 2 && spentSum === 0) return { ...base, profile: 'SINGLE_USE_DEPOSIT' };
  if (txCount >= 10 || fundedCount >= 5) return { ...base, profile: 'ACTIVE_REUSED_WALLET' };
  return { ...base, profile: 'DORMANT_HOLDER' };
}

/**
 * Classify Bitcoin script types from address prefix and scriptpubkey type string.
 */
export function getScriptTypeFromAddress(address, scriptType = '') {
  if (scriptType === 'op_return' || !address) return 'Embedded data';
  if (scriptType === 'p2pk' || (address && address.includes('P2PK'))) return 'Early public key (P2PK)';
  if (scriptType === 'multisig') return 'Shared signatures';
  if (address.startsWith('bc1p') || scriptType === 'v1_p2tr') return 'Taproot (P2TR)';
  if (address.startsWith('bc1q') && address.length > 50) return 'SegWit script';
  if (address.startsWith('bc1q') || scriptType === 'v0_p2wpkh') return 'Native SegWit';
  if (address.startsWith('3') || scriptType === 'p2sh') return 'Script address (P2SH)';
  if (address.startsWith('1') || scriptType === 'p2pkh') return 'Legacy';
  return 'Standard';
}

/**
 * Extract address string or readable public identifier from output/prevout.
 */
export function getAddressOrIdentifier(outputOrPrevout) {
  if (!outputOrPrevout) return null;
  if (outputOrPrevout.scriptpubkey_address) return outputOrPrevout.scriptpubkey_address;
  if (outputOrPrevout.scriptpubkey_type === 'p2pk') {
    const asmParts = (outputOrPrevout.scriptpubkey_asm || '').split(' ');
    const pubkey = asmParts.find(p => p.length === 66 || p.length === 130) || asmParts[1] || outputOrPrevout.scriptpubkey;
    if (pubkey) return `1_P2PK_${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
  }
  if (outputOrPrevout.scriptpubkey_type === 'multisig') {
    return `multisig_${(outputOrPrevout.scriptpubkey || '').slice(0, 12)}`;
  }
  if (outputOrPrevout.scriptpubkey) {
    return `script_${outputOrPrevout.scriptpubkey.slice(0, 16)}`;
  }
  return null;
}

/**
 * Extract and decode OP_RETURN null data payload bytes into ASCII text.
 */
export function parseOpReturnPayload(output) {
  if (!output) return null;
  const isOpReturn = output.scriptpubkey_type === 'op_return' || 
    (output.scriptpubkey && output.scriptpubkey.startsWith('6a')) ||
    (output.scriptpubkey_asm && output.scriptpubkey_asm.startsWith('OP_RETURN'));

  if (!isOpReturn) return null;

  const asm = output.scriptpubkey_asm || '';
  const asmMatch = asm.match(/OP_RETURN\s+([0-9a-fA-F]+)/);
  const hex = asmMatch ? asmMatch[1] : (output.scriptpubkey ? output.scriptpubkey.replace(/^6a/, '') : '');

  const decodeHexToAscii = (strHex) => {
    if (!strHex || strHex.length < 2) return '';
    try {
      const bytes = strHex.match(/.{1,2}/g)?.map(b => parseInt(b, 16)) || [];
      const printable = bytes.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
      return printable.replace(/\./g, '').length >= 2 ? printable : '';
    } catch {
      return '';
    }
  };

  let text = decodeHexToAscii(hex);
  if (!text && hex.length > 2) {
    text = decodeHexToAscii(hex.slice(2));
  }

  return {
    rawHex: hex || output.scriptpubkey || 'OP_RETURN',
    decodedText: text || null
  };
}

/**
 * Compute transaction fee metrics (sat/vB, RBF signal, vsize, weight).
 */
export function calculateTxMetrics(tx) {
  const weight = tx.weight || (tx.size ? tx.size * 4 : 0);
  const vsize = weight > 0 ? Math.ceil(weight / 4) : tx.size || 0;
  const feeSat = tx.fee || 0;
  const feeRateSatVb = vsize > 0 ? (feeSat / vsize).toFixed(1) : 'N/A';
  const isRbfSignaled = (tx.vin || []).some(v => typeof v.sequence === 'number' && v.sequence < 0xfffffffe);
  const blockConfirmation = tx.status?.confirmed 
    ? (tx.status.block_height ? `Block ${tx.status.block_height}` : 'Confirmed')
    : 'Not yet confirmed';

  const entropyAnalysis = calculateCoinJoinEntropy(tx.vout || []);

  return {
    vsize,
    weight,
    feeSat,
    feeRateSatVb,
    isRbfSignaled,
    blockConfirmation,
    entropy: entropyAnalysis.entropy,
    anonymityRatio: entropyAnalysis.anonymityRatio
  };
}

/**
 * Detect CoinJoin / Privacy Mixing rounds: multi-party input set (2+) AND the
 * share-gated equal-denomination shape from calculateCoinJoinEntropy.
 * Deliberately precision-tuned — a false mix HALTS the trace (COINJOIN_HALT)
 * and breaks taint, while a missed mix merely traces through. The looser
 * pool-anchored analyzeCoinJoinSignature lane stays separate for dossier
 * display, where recall matters more than halt-grade certainty.
 */
export function isCoinJoinTransaction(tx) {
  const inputsCount = (tx.vin || []).length;
  const outputs = tx.vout || [];

  if (inputsCount < 2 || outputs.length < 2) return false;

  return calculateCoinJoinEntropy(outputs).isCoinJoin;
}

/**
 * Shared classifier: determines node type/label for a single output using weighted heuristics
 * Used by both formatBlockstreamTx and traceEndReceiver to avoid drift.
 */
function classifyOutputShared({
  tx,
  output,
  outputIndex,
  outspends,
  inputScriptTypes,
  seenAddresses,
  addr,
  scriptStd,
  valBtc,
  isCoinJoin,
}) {
  const outspend = outspends[outputIndex] || {};
  const isSpent = outspend.spent === true;
  const value = output.value || 0;

  const blockHeight = tx.status?.block_height;
  const blockTime = tx.status?.block_time;
  const isHistoricalEra = (blockHeight && blockHeight < 350000) || (blockTime && blockTime < 1400000000) || addr.includes('P2PK') || output.scriptpubkey_type === 'p2pk';

  // Historical era has own simplified rules, but address identity is
  // era-independent accounting: a spent output back to a funder address is
  // change, and a sole fresh output is a payment (e.g. the May-2010 10,000 BTC
  // pizza purchase: 131 funder inputs, one fresh round output). Flattening
  // both to a generic transit hop destroys that decisive signal.
  if (isHistoricalEra) {
    if (!isSpent) {
      return {
        nodeType: 'receiver',
        label: 'End receiver (early network)',
        entityName: 'Early network wallet',
        risk: 'low',
        kycStatus: 'HISTORICAL UNSPENT FUNDS',
        ipLog: 'Early Bitcoin user',
        riskReason: `Early Bitcoin era output holding unspent funds (${scriptStd}). Direct transfer between people.`,
        device: 'Early client',
        confidence: 0.85,
      };
    }
    // Era-independent identity: funder addresses OR bare pubkeys (2009-era
    // P2PK flows have no addresses — compare the keys themselves).
    const histKeyOf = (s) => s?.scriptpubkey_address || (extractTxPubkey(s) ? `pubkey:${extractTxPubkey(s)}` : null);
    const histInputKeys = new Set((tx.vin || []).map(v => histKeyOf(v.prevout)).filter(Boolean));
    const histOutKey = histKeyOf(output);
    const histValueOutputs = (tx.vout || []).filter(o => (o.value || 0) > 0);
    const histIsSelf = !!histOutKey && histInputKeys.has(histOutKey);
    const histIsSoleFresh = !histIsSelf && value > 0 && histValueOutputs.length === 1 && histValueOutputs[0] === output;
    // Dwell behavior from spender heights: fast sweep vs dwelled payment.
    const histDwell = getSpendDwellBlocks(tx, outspend);
    const histIsQuickSweep = !histIsSelf && histDwell != null && histDwell <= QUICK_SPEND_BLOCKS;
    const histIsDwelled = !histIsSelf && !histIsSoleFresh && histDwell != null && histDwell >= LONG_DWELL_BLOCKS;
    const histVerdict = histIsSelf || histIsQuickSweep ? 'change'
      : histIsSoleFresh || histIsDwelled ? 'payment' : null;
    if (histVerdict) {
      const histIsChange = histVerdict === 'change';
      const histScore = histIsSelf ? -4.0 : histIsSoleFresh ? 4.0 : histIsChange ? -1.5 : 1.5;
      const histConf = (histIsSelf || histIsSoleFresh) ? 0.85 : 0.65;
      const histWhy = histIsSelf
        ? `Output reuses a funder key (Block #${blockHeight || 'early'}) — self-consolidation, not a payment.`
        : histIsSoleFresh
          ? `Sole output to a fresh identity (${valBtc} BTC, Block #${blockHeight || 'early'}) — payment by construction, no change exists.`
          : histIsChange
            ? `Spent ${histDwell} blocks after confirmation — fast change sweep (Block #${blockHeight || 'early'}).`
            : `Dwelled ${histDwell} blocks before moving — recipient holding, not a change sweep (Block #${blockHeight || 'early'}).`;
      return {
        nodeType: 'hop',
        label: histIsChange
          ? (histIsSelf ? 'Change (early network)' : 'Change step (early network)')
          : 'Payment (early network)',
        entityName: histIsChange ? 'Early change' : 'Early payment receiver',
        risk: 'low',
        kycStatus: histIsChange ? 'HISTORICAL CHANGE' : 'HISTORICAL PAYMENT',
        ipLog: 'Early Bitcoin user',
        riskReason: histWhy,
        device: 'Early client',
        confidence: histConf,
        // Score-only heuristics: feeds trace confidence without modern-weight breakdown fields
        heuristics: {
          score: histScore,
          confidence: histConf,
          weightedScore: histScore,
          isChangeCandidate: histScore < -1.0,
          isPaymentCandidate: histScore > 1.0,
        },
        ...(histIsChange ? { isChange: true } : { isPayment: true }),
      };
    }
    return {
      nodeType: 'hop',
      label: 'Pass-through (early network)',
      entityName: 'Early network transfer',
      risk: 'low',
      kycStatus: 'HISTORICAL DIRECT TRANSFER',
      ipLog: 'Early Bitcoin user',
      riskReason: `Early direct on-chain transfer (Block #${blockHeight || 'early'}). Plain historical flow.`,
      device: 'Early client',
      confidence: 0.9,
    };
  }

  // Dust handling
  if (isDustOutput(value)) {
    return {
      nodeType: 'hop',
      label: 'Dust Output',
      entityName: 'Dust / Uneconomic Output',
      risk: 'low',
      kycStatus: 'DUST (UNECONOMIC)',
      ipLog: 'N/A',
      riskReason: `Dust output (${value} satoshis < ${DUST_THRESHOLD_SATS}) — too small to spend, ignored for tracing.`,
      device: 'N/A',
      confidence: 0.92,
      isDust: true,
    };
  }

  // CoinJoin outputs: never mark as change/payment, flag as mixed
  if (isCoinJoin) {
    // In CoinJoin, all equal outputs are mixed payments, not change
    return {
      nodeType: 'mixer',
      label: 'Mix Output',
        entityName: 'Mixed output',
      risk: 'high',
      kycStatus: 'MIXED FUNDS',
      ipLog: 'Privacy Mixing Round',
      riskReason: `Equal-value mixing output — the trail breaks here, not traceable as change/payment.`,
      device: 'CoinJoin Coordinator',
      confidence: 0.4,
      isCoinJoinOutput: true,
    };
  }

  // Weighted heuristic scoring (primary decision engine). outputId carries the
  // classifier's identifier (address or P2PK pseudo-id) for reuse checks.
  const heuristics = scoreOutputHeuristics({
    tx,
    outputIndex,
    inputScriptTypes,
    outspends,
    seenAddresses,
    outputId: addr,
  });

  const exchangeConf = exchangeDepositConfidence(addr, output.scriptpubkey_type, outspend);

  // Unspent terminal output overrides many heuristics
  if (!isSpent) {
    // If exchange confidence high, mark as identity-checked receiver, else generic holder
    if (exchangeConf > 0.4) {
      return {
        nodeType: 'receiver',
        label: 'End receiver (exchange)',
        entityName: 'Unspent exchange deposit',
        risk: 'low',
        kycStatus: 'IDENTITY VERIFIED (UNSPENT)',
        ipLog: 'Exchange',
        riskReason: `Unspent exchange-held output (${scriptStd}, exchange likelihood ${(exchangeConf*100).toFixed(0)}%, heuristic ${heuristics.score}) — holds ${valBtc} BTC.`,
        device: 'Exchange',
        confidence: Math.max(0.78, heuristics.confidence),
        exchangeConf,
        heuristics,
      };
    }
    return {
      nodeType: 'receiver',
      label: 'End receiver (unspent)',
      entityName: 'Unspent output wallet',
      risk: 'low',
      kycStatus: 'HOLDING FUNDS (UNSPENT)',
      ipLog: 'On chain',
      riskReason: `Output remains unspent (${scriptStd}, heuristic ${heuristics.score}) — end receiver holds ${valBtc} BTC.`,
      device: 'N/A',
      confidence: Math.max(0.82, heuristics.confidence),
      heuristics,
    };
  }

  // Spent outputs: decide change vs payment
  if (heuristics.isChangeCandidate) {
    return {
      nodeType: 'hop',
      label: 'Change',
      entityName: 'Change wallet',
      risk: 'low',
      kycStatus: 'UNREGISTERED TRANSIT (CHANGE)',
      ipLog: 'In transit',
      riskReason: `Change address detected (heuristic ${heuristics.score}, ${(heuristics.confidence*100).toFixed(0)}% confidence, script ${scriptStd}).`,
      device: 'N/A',
      confidence: heuristics.confidence,
      heuristics,
      exchangeConf,
      isChange: true,
    };
  }

  if (heuristics.isPaymentCandidate || exchangeConf > 0.45) {
    // Spent payment: still a receiver but with forward history — mark as spent-receiver if not followed
    // traceEndReceiver will link forward, so this is intermediate payment hop that will be expanded
    // For display, treat as receiver if at maxDepth or exchange, else hop with payment hint
    const isLikelyExchange = exchangeConf > 0.45;
    return {
      nodeType: isLikelyExchange ? 'receiver' : 'hop',
      label: isLikelyExchange ? 'End receiver (exchange, spent)' : 'Payment',
      entityName: isLikelyExchange ? 'Exchange account (spent)' : 'Payment recipient',
      risk: isLikelyExchange ? 'low' : 'medium',
      kycStatus: isLikelyExchange ? 'IDENTITY VERIFIED' : 'PAYMENT RECIPIENT',
      ipLog: isLikelyExchange ? 'Exchange' : 'Payment endpoint',
      riskReason: isLikelyExchange
        ? `Exchange deposit (script ${scriptStd}, likelihood ${(exchangeConf*100).toFixed(0)}%, heuristic ${heuristics.score}).`
        : `Payment to recipient (${scriptStd}, heuristic ${heuristics.score}) — spent forward.`,
      device: isLikelyExchange ? 'Exchange' : 'Recipient wallet',
      confidence: Math.max(heuristics.confidence, isLikelyExchange ? 0.6 : 0.5),
      heuristics,
      exchangeConf,
      isPayment: true,
    };
  }

  // Ambiguous — default to hop
  return {
    nodeType: 'hop',
    label: 'Pass-through',
    entityName: 'Pass-through wallet',
    risk: 'low',
    kycStatus: 'UNREGISTERED TRANSIT',
    ipLog: 'In transit',
    riskReason: `Middle step (heuristic ${heuristics.score}, unclear, ${scriptStd}).`,
    device: 'N/A',
    confidence: heuristics.confidence,
    heuristics,
    exchangeConf,
  };
}

/**
 * Format a raw Blockstream transaction object into graph nodes and links.
 * Now uses shared weighted classifier and value conservation checks.
 */
export function formatBlockstreamTx(tx, outspends = []) {
  const nodes = [];
  const links = [];
  const txNodeId = `tx_${tx.txid}`;
  const seenAddresses = new Set();

  const metrics = calculateTxMetrics(tx);
  const isCoinJoin = isCoinJoinTransaction(tx);
  const conservation = checkValueConservation(tx);

  // Centralized conservation-aware risk reason
  const hubRiskReason = isCoinJoin
    ? `Detected equal-value mixing across ${tx.vin?.length || 0} inputs.`
    : !conservation.valid
      ? `Value mismatch: ${conservation.reason} — possible non-standard/fee anomaly.`
      : `Fee: ${metrics.feeRateSatVb} satoshis per byte. Size: ${tx.size} bytes (${metrics.vsize} bytes). ${metrics.isRbfSignaled ? 'Fee can be replaced.' : ''}`;

  nodes.push(buildTxHubNode({
    txId: tx.txid,
    metrics: { ...metrics, blockTime: tx.status?.block_time, blockConfirmation: metrics.blockConfirmation, riskReason: hubRiskReason, conservation },
    isCoinJoin,
    conservation,
    totalOutSats: (tx.vout || []).reduce((s, o) => s + (o.value || 0), 0),
  }));

  const inputScriptTypes = [];
  (tx.vin || []).forEach(input => {
    const addr = input.prevout ? getAddressOrIdentifier(input.prevout) : (input.is_coinbase ? 'Coinbase (Mining Reward)' : null);
    const scriptStd = input.prevout ? getScriptTypeFromAddress(addr, input.prevout?.scriptpubkey_type) : 'Coinbase';
    if (scriptStd) inputScriptTypes.push(scriptStd);
    if (addr) {
      const sat = input.prevout?.value || 0;
      const valBtc = (sat / 100000000).toFixed(6);
      const inputNodeId = `in_${addr}`;
      seenAddresses.add(addr);
      if (!nodes.some(n => n.id === inputNodeId)) {
        nodes.push(buildInputNode({ addr, scriptStd, satoshis: sat }));
      }
      links.push({ source: inputNodeId, target: txNodeId, value: `${valBtc} BTC`, timestamp: 'On-chain' });
    }
  });

  // Mark depth for hop-decay heuristic
  tx._traceDepth = 0;
  (tx.vout || []).forEach((output, i) => {
    const opReturn = parseOpReturnPayload(output);
    if (opReturn) {
      nodes.push(buildOpReturnNode({ txId: tx.txid, index: i, payload: opReturn }));
      links.push({ source: txNodeId, target: `op_${tx.txid}_${i}`, value: '0 BTC Data', timestamp: 'Embedded' });
      return;
    }

    const addr = getAddressOrIdentifier(output) || `out_script_${tx.txid.slice(0, 6)}_${i}`;
    const valBtc = (output.value / 100000000).toFixed(6);
    const outNodeId = `out_${addr}`;
    const scriptStd = getScriptTypeFromAddress(addr, output.scriptpubkey_type);

    const cls = classifyOutputShared({
      tx, output, outputIndex: i, outspends, inputScriptTypes, seenAddresses, addr, scriptStd, valBtc, isCoinJoin,
    });

    if (!nodes.some(n => n.id === outNodeId)) {
      const lastActive = cls.kycStatus?.includes('UNSPENT')
        ? (tx.status?.block_time ? new Date(tx.status.block_time * 1000).toLocaleDateString() : 'Active unspent funds')
        : cls.kycStatus?.includes('HISTORICAL') ? 'Historical Transfer'
        : cls.kycStatus?.includes('MIXED') ? 'Mixed funds' : 'Transit';
      nodes.push(buildOutputNode({ outNodeId, addr, valBtc, scriptStd, cls, tx, lastActive }));
    }

    links.push({ source: txNodeId, target: outNodeId, value: `${valBtc} BTC`, timestamp: tx.status?.block_time ? new Date(tx.status.block_time*1000).toLocaleDateString() : 'On-chain' });
    seenAddresses.add(addr);
  });

  return { nodes, links };
}

/**
 * Enhanced Recursive Outspends Tracing — BFS level-order with parallel fetching, confidence propagation, and CoinJoin halt.
 * Returns { nodes, links, meta: { confidence, warnings, haltReason, stats } }
 * Throws when the ROOT transaction itself cannot be fetched (unknown txid or
 * unreachable gateways) so callers fall back to the algorithmic trace with the
 * reason attached — instead of planting a corrupt empty case behind a false
 * "completed" toast. Deeper-hop failures only warn and prune that branch.
 */
export async function traceEndReceiver(startTxId, maxDepth = 2) {
  const nodes = [];
  const links = [];
  const processedTxs = new Set();
  const seenAddresses = new Set();
  const pendingHeuristics = [];
  const warnings = [];
  let haltReason = null;
  let totalFetched = 0;

  // Dedup helpers
  const nodeIds = new Set();
  function addNode(node) {
    if (!nodeIds.has(node.id)) { nodeIds.add(node.id); nodes.push(node); }
  }
  const linkKeys = new Set();
  function addLink(src, tgt, value, ts) {
    const k = `${src}->${tgt}::${value}`;
    if (!linkKeys.has(k)) { linkKeys.add(k); links.push({ source: src, target: tgt, value, timestamp: ts }); }
  }

  // BFS queue: array of { txId, depth, parentOutNodeId, parentValue, branchValueSats }
  let frontier = [{ txId: startTxId, depth: 0, parentOutNodeId: null, parentValue: null, branchValueSats: Number.MAX_SAFE_INTEGER }];
  let depthReached = 0;

  // Bounded-parallel fetch: full Promise.all over a 24-wide frontier fires
  // ~48 API calls at once and trips gateway rate limits (429). Chunks of 5
  // keep throughput high without hammering the failover endpoints.
  async function fetchTxBatch(ids) {
    const results = [];
    const CONCURRENCY = 5;
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const chunk = ids.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map(async (id) => {
        try {
          const [tx, outspends] = await Promise.all([fetchTx(id), fetchOutspends(id)]);
          totalFetched++;
          return { id, tx, outspends, error: null };
        } catch (e) {
          return { id, tx: null, outspends: null, error: e.message };
        }
      }));
      results.push(...chunkResults);
    }
    return results;
  }

  for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth++) {
    if (nodes.length > TRACE_CONFIG.MAX_NODES) {
      warnings.push(`Node limit ${TRACE_CONFIG.MAX_NODES} reached — truncating trace`);
      haltReason = 'NODE_LIMIT';
      break;
    }
    if (frontier.length > TRACE_CONFIG.MAX_BRANCHING * 2) {
      warnings.push(`Branching factor ${frontier.length} exceeds limit — pruning weakest branches`);
      // Prune lowest-value branches first so the dominant money trail survives
      frontier = [...frontier]
        .sort((a, b) => (b.branchValueSats || 0) - (a.branchValueSats || 0))
        .slice(0, TRACE_CONFIG.MAX_BRANCHING * 2);
    }

    // Fetch all txs in frontier with bounded parallelism
    const txIds = frontier.map(f => f.txId);
    const uniqueTxIds = [...new Set(txIds.filter(id => !processedTxs.has(id)))];
    if (uniqueTxIds.length === 0) break;

    let txResults;
    try {
      txResults = await fetchTxBatch(uniqueTxIds);
    } catch (e) {
      warnings.push(`Batch fetch failed at depth ${depth}: ${e.message}`);
      break;
    }
    depthReached = Math.max(depthReached, depth);

    const txMap = new Map(txResults.map(r => [r.id, r]));
    const nextFrontier = [];

    for (const item of frontier) {
      if (processedTxs.has(item.txId)) continue;
      processedTxs.add(item.txId);

      const res = txMap.get(item.txId);
      if (!res || res.error || !res.tx) {
        if (item.txId === startTxId && depth === 0) {
          const reason = /404/.test(res?.error || '')
            ? 'not found on the live network (checked Blockstream and Mempool.space)'
            : (res?.error || 'fetch failed on both sources');
          throw new Error(`Transaction ${startTxId.slice(0, 12)}... ${reason}`);
        }
        warnings.push(`Failed to fetch tx ${item.txId.slice(0, 8)}: ${res?.error || 'unknown'}`);
        continue;
      }
      const tx = res.tx;
      const outspends = res.outspends || [];
      const conservation = checkValueConservation(tx);
      if (!conservation.valid) warnings.push(`Value conservation failed for ${item.txId.slice(0, 8)}: ${conservation.reason}`);

      const metrics = calculateTxMetrics(tx);
      const isCoinJoin = isCoinJoinTransaction(tx);
      if (isCoinJoin && TRACE_CONFIG.COINJOIN_HALT) {
        warnings.push(`Mixing detected at ${item.txId.slice(0, 8)} — stopping this branch (trail breaks here)`);
        // Still emit tx node but don't expand its outputs
        if (depth === 0) haltReason = 'COINJOIN_AT_ROOT';
      }

      const txNodeId = `tx_${item.txId}`;
      // Attach depth for heuristic decay and build via factory
      tx._traceDepth = depth;
      const hubReason = isCoinJoin ? `Mixing across ${tx.vin?.length || 0} inputs — stopped here.` : `Fee ${metrics.feeRateSatVb} satoshis per byte (${metrics.vsize} bytes). ${conservation.valid ? '' : conservation.reason}`;
      addNode(buildTxHubNode({
        txId: item.txId,
        metrics: { ...metrics, blockTime: tx.status?.block_time, blockConfirmation: metrics.blockConfirmation, riskReason: hubReason, conservation },
        isCoinJoin,
        conservation,
        depth,
        totalOutSats: (tx.vout || []).reduce((s, o) => s + (o.value || 0), 0),
      }));

      if (item.parentOutNodeId) {
        addLink(item.parentOutNodeId, txNodeId, item.parentValue || '0 BTC', 'Forwarded');
      }

      // Inputs (only for depth 0 to avoid duplication)
      const inputScriptTypes = [];
      if (depth === 0) {
        for (const input of (tx.vin || [])) {
          const addr = input.prevout ? getAddressOrIdentifier(input.prevout) : (input.is_coinbase ? 'Coinbase (Mining Reward)' : null);
          const scriptStd = input.prevout ? getScriptTypeFromAddress(addr, input.prevout?.scriptpubkey_type) : 'Coinbase';
          if (scriptStd) inputScriptTypes.push(scriptStd);
          if (addr) {
            seenAddresses.add(addr);
            const sat = input.prevout?.value || 0;
            const valBtc = (sat / 100000000).toFixed(6);
            const inputNodeId = `in_${addr}`;
            addNode(buildInputNode({ addr, scriptStd, satoshis: sat }));
            addLink(inputNodeId, txNodeId, `${valBtc} BTC`, 'On-chain');
          }
        }
      } else {
        // For deeper levels, still collect types for heuristic but don't re-emit inputs
        for (const v of (tx.vin || [])) {
          const a = v.prevout?.scriptpubkey_address;
          const t = v.prevout?.scriptpubkey_type;
          if (a || t) inputScriptTypes.push(getScriptTypeFromAddress(a || 'unknown', t || ''));
        }
      }

      if (isCoinJoin && TRACE_CONFIG.COINJOIN_HALT) continue;
      if (depth >= maxDepth) continue;

      for (let i = 0; i < (tx.vout || []).length; i++) {
        const output = tx.vout[i];
        const opReturn = parseOpReturnPayload(output);
        if (opReturn) {
          addNode(buildOpReturnNode({ txId: item.txId, index: i, payload: opReturn }));
          addLink(txNodeId, `op_${item.txId}_${i}`, '0 BTC Data', 'Embedded');
          continue;
        }

        const addr = getAddressOrIdentifier(output) || `out_script_${item.txId.slice(0, 6)}_${i}`;
        const valBtc = (output.value / 100000000).toFixed(6);
        const outNodeId = `out_${addr}`;
        const scriptStd = getScriptTypeFromAddress(addr, output.scriptpubkey_type);
        const outspend = outspends[i] || {};
        const isSpent = outspend.spent === true;
        const spendingTxId = outspend.txid || null;

        const cls = classifyOutputShared({
          tx, output, outputIndex: i, outspends, inputScriptTypes, seenAddresses, addr, scriptStd, valBtc, isCoinJoin,
        });
        if (cls.heuristics) pendingHeuristics.push(cls.heuristics);

        const lastActive = cls.kycStatus?.includes('UNSPENT') ? 'Holds unspent funds' : cls.kycStatus?.includes('MIXED') ? 'Mixed funds' : 'On chain';
        addNode(buildOutputNode({ outNodeId, addr, valBtc, scriptStd, cls, tx, lastActive }));
        addLink(txNodeId, outNodeId, `${valBtc} BTC`, tx.status?.block_time ? new Date(tx.status.block_time*1000).toLocaleDateString() : 'On-chain');
        seenAddresses.add(addr);

        // Queue next hop only if: spent, not dust, not CoinJoin, not self-loop, and under depth
        if (isSpent && spendingTxId && !cls.isDust && !cls.isCoinJoinOutput) {
          // Avoid loops: don't follow if address already traces to visited tx
          if (processedTxs.has(spendingTxId)) continue;
          // Prioritize change outputs less: if high confidence change, follow but don't mark as payment path
          // Always follow change to find ultimate peel end; payment branches are situational.
          const isHighConfChange = cls.isChange && (cls.confidence || 0) > 0.6;
          // Carry branch value so over-wide frontiers prune dust first, not the money trail
          nextFrontier.push({ txId: spendingTxId, depth: depth + 1, parentOutNodeId: outNodeId, parentValue: `${valBtc} BTC`, branchValueSats: output.value || 0, _isChange: isHighConfChange });
        } else if (isDustOutput(output.value)) {
          // ignore
        }
      }
    }

    // Sort next frontier so change outputs are explored first (peel chain priority), keep branching limit
    nextFrontier.sort((a, b) => (a._isChange === b._isChange ? 0 : a._isChange ? -1 : 1));
    frontier = nextFrontier.slice(0, TRACE_CONFIG.MAX_BRANCHING * 3);
  }

  // No scored hops (e.g. halted at a mixing root before any output was
  // classified): report unknown rather than a default 50% that reads as
  // a measured result. All consumers null-check confidence first.
  const traceConf = pendingHeuristics.length > 0 ? computeTraceConfidence(pendingHeuristics) : null;
  const meta = {
    confidence: traceConf ? traceConf.confidence : null,
    confidenceLevel: traceConf ? traceConf.level : 'Unknown',
    ambiguousHops: traceConf ? traceConf.ambiguousCount : 0,
    warnings,
    haltReason,
    stats: { fetchedTxCount: totalFetched, nodeCount: nodes.length, linkCount: links.length, depthReached },
  };

  // Attach meta to result for consumers; keep nodes/links backward compatible
  return { nodes, links, meta };
}
