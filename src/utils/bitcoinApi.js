import { API_CONFIG } from '../constants/config';
import { calculateCoinJoinEntropy } from './clusteringAlgorithms';
import {
  scoreOutputHeuristics,
  checkValueConservation,
  exchangeDepositConfidence,
  computeTraceConfidence,
  isDustOutput,
  TRACE_CONFIG,
  DUST_THRESHOLD_SATS,
} from './traceHeuristics';
import { buildTxHubNode, buildInputNode, buildOpReturnNode } from './graphBuilders';

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
 * Classify Bitcoin script types from address prefix and scriptpubkey type string.
 */
export function getScriptTypeFromAddress(address, scriptType = '') {
  if (scriptType === 'op_return' || !address) return 'OP_RETURN (Null Data)';
  if (scriptType === 'p2pk' || (address && address.includes('P2PK'))) return 'Pay-to-PubKey (Legacy P2PK)';
  if (scriptType === 'multisig') return 'Bare Multi-Sig (P2MS)';
  if (address.startsWith('bc1p') || scriptType === 'v1_p2tr') return 'Taproot (P2TR / Bech32m)';
  if (address.startsWith('bc1q') && address.length > 50) return 'SegWit Script (v0 P2WSH)';
  if (address.startsWith('bc1q') || scriptType === 'v0_p2wpkh') return 'Native SegWit (v0 P2WPKH)';
  if (address.startsWith('3') || scriptType === 'p2sh') return 'Pay-to-Script-Hash (P2SH Multi-sig)';
  if (address.startsWith('1') || scriptType === 'p2pkh') return 'Legacy (P2PKH)';
  return 'Standard Script';
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
    ? (tx.status.block_height ? `Block #${tx.status.block_height}` : 'Confirmed')
    : 'Unconfirmed (In Mempool)';

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
 * Detect CoinJoin / Privacy Mixing rounds based on input counts, equal output values, and Shannon entropy.
 */
export function isCoinJoinTransaction(tx) {
  const inputsCount = (tx.vin || []).length;
  const outputs = tx.vout || [];

  if (inputsCount < 2 || outputs.length < 2) return false;

  const entropy = calculateCoinJoinEntropy(outputs);
  if (entropy.isCoinJoin) return true;

  const valueCounts = {};
  outputs.forEach(o => {
    if (o.value > 0) {
      valueCounts[o.value] = (valueCounts[o.value] || 0) + 1;
    }
  });

  const maxEqualOutputs = Math.max(0, ...Object.values(valueCounts));
  return maxEqualOutputs >= 2;
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

  // Historical era has own simplified rules
  if (isHistoricalEra) {
    if (!isSpent) {
      return {
        nodeType: 'receiver',
        label: 'End Receiver: UTXO (Historical)',
        entityName: 'Historical P2P Unspent Wallet',
        risk: 'low',
        kycStatus: 'HISTORICAL UNSPENT UTXO',
        ipLog: 'Early Bitcoin P2P Peer',
        riskReason: `Early Bitcoin era output holding unspent funds (${scriptStd}). Direct peer-to-peer transaction.`,
        device: 'Early Satoshi Client',
        confidence: 0.85,
      };
    }
    return {
      nodeType: 'hop',
      label: 'Transit Hop (Historical P2P)',
      entityName: 'Historical P2P Transfer Hop',
      risk: 'low',
      kycStatus: 'HISTORICAL P2P TRANSFER',
      ipLog: 'Early Bitcoin P2P Peer',
      riskReason: `Historical direct peer-to-peer on-chain transaction (Block #${blockHeight || 'early'}). Clean historical flow.`,
      device: 'Early Satoshi Client',
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
      riskReason: `Dust output (${value} sats < ${DUST_THRESHOLD_SATS}) — uneconomic to spend, ignored for tracing.`,
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
      entityName: 'CoinJoin Mixed Output',
      risk: 'high',
      kycStatus: 'COINJOIN MIXED',
      ipLog: 'Privacy Mixing Round',
      riskReason: `Equal-value CoinJoin output — taint broken, not traceable as change/payment.`,
      device: 'CoinJoin Coordinator',
      confidence: 0.4,
      isCoinJoinOutput: true,
    };
  }

  // Weighted heuristic scoring (primary decision engine)
  const heuristics = scoreOutputHeuristics({
    tx,
    outputIndex,
    inputScriptTypes,
    outspends,
    seenAddresses,
  });

  const exchangeConf = exchangeDepositConfidence(addr, output.scriptpubkey_type, outspend);

  // Unspent terminal UTXO overrides many heuristics
  if (!isSpent) {
    // If exchange confidence high, mark as KYC receiver, else generic UTXO
    if (exchangeConf > 0.4) {
      return {
        nodeType: 'receiver',
        label: 'End Receiver: Exchange/Dormant',
        entityName: 'Unspent Exchange Deposit',
        risk: 'low',
        kycStatus: 'KYC VERIFIED (UNSPENT)',
        ipLog: 'Registered Exchange Gateway',
        riskReason: `Unspent custodial output (${scriptStd}, exchange conf ${(exchangeConf*100).toFixed(0)}%, heuristic ${heuristics.score}) — terminal deposit holder holds ${valBtc} BTC.`,
        device: 'Exchange Wallet',
        confidence: Math.max(0.78, heuristics.confidence),
        exchangeConf,
        heuristics,
      };
    }
    return {
      nodeType: 'receiver',
      label: 'End Receiver: UTXO',
      entityName: 'Unspent Output Wallet',
      risk: 'low',
      kycStatus: 'HOLDING FUNDS (UNSPENT)',
      ipLog: 'On-chain Wallet',
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
      label: 'Change Hop',
      entityName: 'Change / Transit Wallet',
      risk: 'low',
      kycStatus: 'UNREGISTERED TRANSIT (CHANGE)',
      ipLog: 'Transit Proxy',
      riskReason: `Change address detected (heuristic ${heuristics.score}, conf ${(heuristics.confidence*100).toFixed(0)}%, script ${scriptStd}).`,
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
      label: isLikelyExchange ? 'End Receiver: Exchange (Spent)' : 'Payment Hop',
      entityName: isLikelyExchange ? 'Attributed Exchange Gateway (Spent)' : 'Payment Recipient Hop',
      risk: isLikelyExchange ? 'low' : 'medium',
      kycStatus: isLikelyExchange ? 'KYC VERIFIED' : 'PAYMENT RECIPIENT',
      ipLog: isLikelyExchange ? 'Registered Exchange Gateway' : 'Payment Endpoint',
      riskReason: isLikelyExchange
        ? `Centralized exchange deposit (script ${scriptStd}, exchange ${(exchangeConf*100).toFixed(0)}%, heur ${heuristics.score}).`
        : `Payment output to recipient (${scriptStd}, heur ${heuristics.score}) — spent forward.`,
      device: isLikelyExchange ? 'Exchange Gateway' : 'Recipient Wallet',
      confidence: Math.max(heuristics.confidence, isLikelyExchange ? 0.6 : 0.5),
      heuristics,
      exchangeConf,
      isPayment: true,
    };
  }

  // Ambiguous — default to hop
  return {
    nodeType: 'hop',
    label: 'Transit Hop',
    entityName: 'Intermediate Transit Wallet',
    risk: 'low',
    kycStatus: 'UNREGISTERED TRANSIT',
    ipLog: 'Transit Proxy',
    riskReason: `Intermediate hop (heuristic ${heuristics.score}, ambiguous, ${scriptStd}).`,
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
    ? `Detected equal-value output CoinJoin mixing structure across ${tx.vin?.length || 0} inputs.`
    : !conservation.valid
      ? `Value mismatch: ${conservation.reason} — possible non-standard/fee anomaly.`
      : `Fee Rate: ${metrics.feeRateSatVb} sat/vB. Size: ${tx.size} bytes (${metrics.vsize} vB). ${metrics.isRbfSignaled ? 'Signaled RBF.' : ''}`;

  nodes.push(buildTxHubNode({
    txId: tx.txid,
    metrics: { ...metrics, blockTime: tx.status?.block_time, blockConfirmation: metrics.blockConfirmation, riskReason: hubRiskReason, conservation },
    isCoinJoin,
    conservation,
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
      nodes.push({
        id: outNodeId,
        label: cls.label,
        type: cls.nodeType,
        balance: `${valBtc} BTC`,
        risk: cls.risk,
        entityName: cls.entityName,
        details: {
          address: addr,
          lastActive: cls.kycStatus?.includes('UNSPENT') ? (tx.status?.block_time ? new Date(tx.status.block_time * 1000).toLocaleDateString() : 'Active UTXO') : cls.kycStatus?.includes('HISTORICAL') ? 'Historical Transfer' : cls.kycStatus?.includes('COINJOIN') ? 'Mixed Output' : 'Transit',
          ipLog: cls.ipLog,
          kycStatus: cls.kycStatus,
          scriptStandard: scriptStd,
          riskReason: cls.riskReason,
          device: cls.device,
          heuristicScore: cls.heuristics?.weightedScore,
          heuristicConfidence: cls.confidence,
          heuristicBreakdown: cls.heuristics?.breakdown,
          blockHeight: tx.status?.block_height || null,
          blockTime: tx.status?.block_time || null,
          exchangeConf: cls.exchangeConf,
        }
      });
    }

    links.push({ source: txNodeId, target: outNodeId, value: `${valBtc} BTC`, timestamp: tx.status?.block_time ? new Date(tx.status.block_time*1000).toLocaleDateString() : 'On-chain' });
    seenAddresses.add(addr);
  });

  return { nodes, links };
}

/**
 * Enhanced Recursive Outspends Tracing — BFS level-order with parallel fetching, confidence propagation, and CoinJoin halt.
 * Returns { nodes, links, meta: { confidence, warnings, haltReason, stats } }
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

  // BFS queue: array of { txId, depth, parentOutNodeId, parentValue }
  let frontier = [{ txId: startTxId, depth: 0, parentOutNodeId: null, parentValue: null }];

  for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth++) {
    if (nodes.length > TRACE_CONFIG.MAX_NODES) {
      warnings.push(`Node limit ${TRACE_CONFIG.MAX_NODES} reached — truncating trace`);
      haltReason = 'NODE_LIMIT';
      break;
    }
    if (frontier.length > TRACE_CONFIG.MAX_BRANCHING * 2) {
      warnings.push(`Branching factor ${frontier.length} exceeds limit — pruning weakest branches`);
      frontier = frontier.slice(0, TRACE_CONFIG.MAX_BRANCHING * 2);
    }

    // Fetch all txs in frontier in parallel
    const txIds = frontier.map(f => f.txId);
    const uniqueTxIds = [...new Set(txIds.filter(id => !processedTxs.has(id)))];
    if (uniqueTxIds.length === 0) break;

    let txResults;
    try {
      txResults = await Promise.all(uniqueTxIds.map(async (id) => {
        try {
          const [tx, outspends] = await Promise.all([fetchTx(id), fetchOutspends(id)]);
          totalFetched++;
          return { id, tx, outspends, error: null };
        } catch (e) {
          return { id, tx: null, outspends: null, error: e.message };
        }
      }));
    } catch (e) {
      warnings.push(`Batch fetch failed at depth ${depth}: ${e.message}`);
      break;
    }

    const txMap = new Map(txResults.map(r => [r.id, r]));
    const nextFrontier = [];

    for (const item of frontier) {
      if (processedTxs.has(item.txId)) continue;
      processedTxs.add(item.txId);

      const res = txMap.get(item.txId);
      if (!res || res.error || !res.tx) {
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
        warnings.push(`CoinJoin detected at ${item.txId.slice(0, 8)} — halting branch (taint broken)`);
        // Still emit tx node but don't expand its outputs
        if (depth === 0) haltReason = 'COINJOIN_AT_ROOT';
      }

      const txNodeId = `tx_${item.txId}`;
      // Attach depth for heuristic decay and build via factory
      tx._traceDepth = depth;
      const hubReason = isCoinJoin ? `CoinJoin mixing across ${tx.vin?.length || 0} inputs — halted.` : `Fee ${metrics.feeRateSatVb} sat/vB (${metrics.vsize} vB). ${conservation.valid ? '' : conservation.reason}`;
      addNode(buildTxHubNode({
        txId: item.txId,
        metrics: { ...metrics, blockTime: tx.status?.block_time, blockConfirmation: metrics.blockConfirmation, riskReason: hubReason, conservation },
        isCoinJoin,
        conservation,
        depth
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

        addNode({
          id: outNodeId,
          label: cls.label,
          type: cls.nodeType,
          balance: `${valBtc} BTC`,
          risk: cls.risk,
          entityName: cls.entityName,
          details: {
            address: addr, lastActive: cls.kycStatus?.includes('UNSPENT') ? 'Active UTXO holder' : cls.kycStatus?.includes('COINJOIN') ? 'Mixed' : 'On-chain',
            ipLog: cls.ipLog, kycStatus: cls.kycStatus, scriptStandard: scriptStd,
            riskReason: cls.riskReason, device: cls.device,
            heuristicScore: cls.heuristics?.weightedScore, heuristicConfidence: cls.confidence,
            heuristicBreakdown: cls.heuristics?.breakdown,
            exchangeConf: cls.exchangeConf,
            blockHeight: tx.status?.block_height || null,
            blockTime: tx.status?.block_time || null,
          }
        });
        addLink(txNodeId, outNodeId, `${valBtc} BTC`, tx.status?.block_time ? new Date(tx.status.block_time*1000).toLocaleDateString() : 'On-chain');
        seenAddresses.add(addr);

        // Queue next hop only if: spent, not dust, not CoinJoin, not self-loop, and under depth
        if (isSpent && spendingTxId && !cls.isDust && !cls.isCoinJoinOutput) {
          // Avoid loops: don't follow if address already traces to visited tx
          if (processedTxs.has(spendingTxId)) continue;
          // Prioritize change outputs less: if high confidence change, follow but don't mark as payment path
          // Always follow change to find ultimate peel end; payment branches are situational.
          const isHighConfChange = cls.isChange && (cls.confidence || 0) > 0.6;
          // If we have many branches, deprioritize high-conf change? No, change is the peel chain — keep it.
          nextFrontier.push({ txId: spendingTxId, depth: depth + 1, parentOutNodeId: outNodeId, parentValue: `${valBtc} BTC`, _isChange: isHighConfChange });
        } else if (isDustOutput(output.value)) {
          // ignore
        }
      }
    }

    // Sort next frontier so change outputs are explored first (peel chain priority), keep branching limit
    nextFrontier.sort((a, b) => (a._isChange === b._isChange ? 0 : a._isChange ? -1 : 1));
    frontier = nextFrontier.slice(0, TRACE_CONFIG.MAX_BRANCHING * 3);
  }

  const traceConf = computeTraceConfidence(pendingHeuristics);
  const meta = {
    confidence: traceConf.confidence,
    confidenceLevel: traceConf.level,
    ambiguousHops: traceConf.ambiguousCount,
    warnings,
    haltReason,
    stats: { fetchedTxCount: totalFetched, nodeCount: nodes.length, linkCount: links.length, depthReached: Math.max(...[0, ...Array.from(processedTxs).map(() => maxDepth)]) },
  };

  // Attach meta to result for consumers; keep nodes/links backward compatible
  return { nodes, links, meta };
}
