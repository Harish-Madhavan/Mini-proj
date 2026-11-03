import { calculateCoinJoinEntropy } from '../../utils/clusteringAlgorithms';
import {
  scoreOutputHeuristics,
  checkValueConservation,
  exchangeDepositConfidence,
  isDustOutput,
  getIdentityKey,
  getSpendDwellBlocks,
  scriptKeyOf,
  QUICK_SPEND_BLOCKS,
  LONG_DWELL_BLOCKS,
  DUST_THRESHOLD_SATS
} from '../../utils/traceHeuristics';
import { buildTxHubNode, buildInputNode, buildOpReturnNode, buildOutputNode } from '../../utils/graphBuilders';
import { satsToBtc } from '../../utils/forensicUtils';
const SCRIPT_DISPLAY_NAMES = {
  op_return: 'Embedded data',
  p2pk: 'Early public key (P2PK)',
  multisig: 'Shared signatures',
  p2tr: 'Taproot (P2TR)',
  p2wsh: 'SegWit script',
  p2wpkh: 'Native SegWit',
  p2sh: 'Script address (P2SH)',
  p2pkh: 'Legacy',
  unknown: 'Standard',
};

/**
 * Human-readable script type: pure display mapping over the canonical key,
 * so labels can never drift from heuristic classification again.
 */
export function getScriptTypeFromAddress(address, scriptType = '') {
  return SCRIPT_DISPLAY_NAMES[scriptKeyOf(address, scriptType)] || 'Standard';
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
 * Deliberately precision-tuned â€” a false mix HALTS the trace (COINJOIN_HALT)
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
 * Historical-era branch of the classifier, kept separate so the modern
 * decision chain stays flat. Same identity + dwell rules, own labels.
 */
function classifyHistoricalOutput({ tx, output, outspend, isSpent, value, scriptStd, valBtc, blockHeight }) {
  if (!isSpent) {
    return classifiedNode({
      nodeType: 'receiver',
      label: 'End receiver (early network)',
      entityName: 'Early network wallet',
      kycStatus: 'HISTORICAL UNSPENT FUNDS',
      ipLog: 'Early Bitcoin user',
      riskReason: `Early Bitcoin era output holding unspent funds (${scriptStd}). Direct transfer between people.`,
      confidence: 0.85,
    });
  }
  // Era-independent identity: funder addresses OR bare pubkeys (2009-era
  // P2PK flows have no addresses â€” compare the keys themselves).
  const histInputKeys = new Set((tx.vin || []).map(v => getIdentityKey(v.prevout)).filter(Boolean));
  const histOutKey = getIdentityKey(output);
  const histValueOutputs = (tx.vout || []).filter(o => (o.value || 0) > 0);
  const histIsSelf = !!histOutKey && histInputKeys.has(histOutKey);
  const histIsSoleFresh = !histIsSelf && value > 0 && histValueOutputs.length === 1 && histValueOutputs[0] === output;
  // Dwell behavior from spender heights: fast sweep vs dwelled payment.
  // A sole fresh output is payment BY CONSTRUCTION (no change can exist
  // alongside it) and outranks dwell: e.g. the May-2010 10,000 BTC pizza
  // purchase (131 inputs, one fresh output, spent 1 block later) is a
  // payment despite the 1-block dwell that would otherwise read as a
  // change sweep. Self-transfer still outranks everything (change by
  // construction).
  const histDwell = getSpendDwellBlocks(tx, outspend);
  const histIsQuickSweep = !histIsSelf && !histIsSoleFresh && histDwell != null && histDwell <= QUICK_SPEND_BLOCKS;
  const histIsDwelled = !histIsSelf && !histIsSoleFresh && histDwell != null && histDwell >= LONG_DWELL_BLOCKS;
  const histVerdict = histIsSelf ? 'change'
    : histIsSoleFresh ? 'payment'
    : histIsQuickSweep ? 'change'
    : histIsDwelled ? 'payment' : null;
  if (histVerdict) {
    const histIsChange = histVerdict === 'change';
    const histScore = histIsSelf ? -4.0 : histIsSoleFresh ? 4.0 : histIsChange ? -1.5 : 1.5;
    const histConf = (histIsSelf || histIsSoleFresh) ? 0.85 : 0.65;
    const histWhy = histIsSelf
      ? `Output reuses a funder key (Block #${blockHeight || 'early'}) â€” self-consolidation, not a payment.`
      : histIsSoleFresh
        ? `Sole output to a fresh identity (${valBtc} BTC, Block #${blockHeight || 'early'}) â€” payment by construction, no change exists.`
        : histIsChange
          ? `Spent ${histDwell} blocks after confirmation â€” fast change sweep (Block #${blockHeight || 'early'}).`
          : `Dwelled ${histDwell} blocks before moving â€” recipient holding, not a change sweep (Block #${blockHeight || 'early'}).`;
    return classifiedNode({
      nodeType: 'hop',
      label: histIsChange
        ? (histIsSelf ? 'Change (early network)' : 'Change step (early network)')
        : 'Payment (early network)',
      entityName: histIsChange ? 'Early change' : 'Early payment receiver',
      kycStatus: histIsChange ? 'HISTORICAL CHANGE' : 'HISTORICAL PAYMENT',
      ipLog: 'Early Bitcoin user',
      riskReason: histWhy,
      confidence: histConf,
      extra: {
        // Score-only heuristics: feeds trace confidence without modern-weight breakdown fields
        heuristics: {
          score: histScore,
          confidence: histConf,
          weightedScore: histScore,
          isChangeCandidate: histScore < -1.0,
          isPaymentCandidate: histScore > 1.0,
        },
        ...(histIsChange ? { isChange: true } : { isPayment: true }),
      },
    });
  }
  return classifiedNode({
    nodeType: 'hop',
    label: 'Pass-through (early network)',
    entityName: 'Early network transfer',
    kycStatus: 'HISTORICAL DIRECT TRANSFER',
    ipLog: 'Early Bitcoin user',
    riskReason: `Early direct on-chain transfer (Block #${blockHeight || 'early'}). Plain historical flow.`,
    confidence: 0.9,
  });
}

/**
 * Classification result factory: every branch below returns the same shape so
 * node builders never drift. Branch-specific extras (heuristics, isChange,
 * isPayment, isDust, isCoinJoinOutput, exchangeConf) ride along in `extra`.
 */
function classifiedNode({ nodeType, label, entityName, risk = 'low', kycStatus, ipLog, riskReason, confidence, extra = {} }) {
  return { nodeType, label, entityName, risk, kycStatus, ipLog, riskReason, confidence, ...extra };
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
  addressMeta = null,
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
    return classifyHistoricalOutput({ tx, output, outspend, isSpent, value, scriptStd, valBtc, blockHeight });
  }
  // Dust handling
  if (isDustOutput(value)) {
    return classifiedNode({
      nodeType: 'hop',
      label: 'Dust Output',
      entityName: 'Dust / Uneconomic Output',
      kycStatus: 'DUST (UNECONOMIC)',
      ipLog: 'N/A',
      riskReason: `Dust output (${value} satoshis < ${DUST_THRESHOLD_SATS}) â€” too small to spend, ignored for tracing.`,
      confidence: 0.92,
      extra: { isDust: true },
    });
  }

  // CoinJoin outputs: never mark as change/payment, flag as mixed
  if (isCoinJoin) {
    // In CoinJoin, all equal outputs are mixed payments, not change
    return classifiedNode({
      nodeType: 'mixer',
      label: 'Mix Output',
      entityName: 'Mixed output',
      risk: 'high',
      kycStatus: 'MIXED FUNDS',
      ipLog: 'Privacy Mixing Round',
      riskReason: `Equal-value mixing output â€” the trail breaks here, not traceable as change/payment.`,
      confidence: 0.4,
      extra: { isCoinJoinOutput: true },
    });
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
    addressMeta,
  });

  const exchangeConf = exchangeDepositConfidence(addr, output.scriptpubkey_type, outspend);

  // Unspent terminal output overrides many heuristics
  if (!isSpent) {
    // If exchange confidence high, mark as identity-checked receiver, else generic holder
    if (exchangeConf > 0.4) {
      return classifiedNode({
        nodeType: 'receiver',
        label: 'End receiver (exchange)',
        entityName: 'Unspent exchange deposit',
        kycStatus: 'IDENTITY VERIFIED (UNSPENT)',
        ipLog: 'Exchange',
        riskReason: `Unspent exchange-held output (${scriptStd}, exchange likelihood ${(exchangeConf*100).toFixed(0)}%, heuristic ${heuristics.score}) â€” holds ${valBtc} BTC.`,
        confidence: Math.max(0.78, heuristics.confidence),
        extra: { exchangeConf, heuristics },
      });
    }
    return classifiedNode({
      nodeType: 'receiver',
      label: 'End receiver (unspent)',
      entityName: 'Unspent output wallet',
      kycStatus: 'HOLDING FUNDS (UNSPENT)',
      ipLog: 'On chain',
      riskReason: `Output remains unspent (${scriptStd}, heuristic ${heuristics.score}) â€” end receiver holds ${valBtc} BTC.`,
      confidence: Math.max(0.82, heuristics.confidence),
      extra: { heuristics },
    });
  }

  // Spent outputs: decide change vs payment
  if (heuristics.isChangeCandidate) {
    return classifiedNode({
      nodeType: 'hop',
      label: 'Change',
      entityName: 'Change wallet',
      kycStatus: 'UNREGISTERED TRANSIT (CHANGE)',
      ipLog: 'In transit',
      riskReason: `Change address detected (heuristic ${heuristics.score}, ${(heuristics.confidence*100).toFixed(0)}% confidence, script ${scriptStd}).`,
      confidence: heuristics.confidence,
      extra: { heuristics, exchangeConf, isChange: true },
    });
  }

  if (heuristics.isPaymentCandidate || exchangeConf > 0.45) {
    // Spent payment: still a receiver but with forward history â€” mark as spent-receiver if not followed
    // traceEndReceiver will link forward, so this is intermediate payment hop that will be expanded
    // For display, treat as receiver if at maxDepth or exchange, else hop with payment hint
    const isLikelyExchange = exchangeConf > 0.45;
    return classifiedNode({
      nodeType: isLikelyExchange ? 'receiver' : 'hop',
      label: isLikelyExchange ? 'End receiver (exchange, spent)' : 'Payment',
      entityName: isLikelyExchange ? 'Exchange account (spent)' : 'Payment recipient',
      risk: isLikelyExchange ? 'low' : 'medium',
      kycStatus: isLikelyExchange ? 'IDENTITY VERIFIED' : 'PAYMENT RECIPIENT',
      ipLog: isLikelyExchange ? 'Exchange' : 'Payment endpoint',
      riskReason: isLikelyExchange
        ? `Exchange deposit (script ${scriptStd}, likelihood ${(exchangeConf*100).toFixed(0)}%, heuristic ${heuristics.score}).`
        : `Payment to recipient (${scriptStd}, heuristic ${heuristics.score}) â€” spent forward.`,
      confidence: Math.max(heuristics.confidence, isLikelyExchange ? 0.6 : 0.5),
      extra: { heuristics, exchangeConf, isPayment: true },
    });
  }

  // Ambiguous â€” default to hop
  return classifiedNode({
    nodeType: 'hop',
    label: 'Pass-through',
    entityName: 'Pass-through wallet',
    kycStatus: 'UNREGISTERED TRANSIT',
    ipLog: 'In transit',
    riskReason: `Middle step (heuristic ${heuristics.score}, unclear, ${scriptStd}).`,
    confidence: heuristics.confidence,
    extra: { heuristics, exchangeConf },
  });
}

/**
 * Shared per-output pipeline for formatBlockstreamTx and traceEndReceiver:
 * OP_RETURN detection, identifier + value formatting, classification.
 * Returns { opReturn } for data carriers, else { addr, valBtc, outNodeId, scriptStd, cls }.
 */
export function prepareOutput({ tx, txid, output, outputIndex, outspends, inputScriptTypes, seenAddresses, isCoinJoin, addressMeta = null }) {
  const opReturn = parseOpReturnPayload(output);
  if (opReturn) return { opReturn };
  const addr = getAddressOrIdentifier(output) || `out_script_${txid.slice(0, 6)}_${outputIndex}`;
  const valBtc = satsToBtc(output.value);
  const outNodeId = `out_${addr}`;
  const scriptStd = getScriptTypeFromAddress(addr, output.scriptpubkey_type);
  const cls = classifyOutputShared({
    tx, output, outputIndex, outspends, inputScriptTypes, seenAddresses, addr, scriptStd, valBtc, isCoinJoin, addressMeta,
  });
  return { addr, valBtc, outNodeId, scriptStd, cls };
}

/**
 * Format a raw Blockstream transaction object into graph nodes and links.
 * Now uses shared weighted classifier and value conservation checks.
 */
export function formatBlockstreamTx(tx, outspends = [], addressMeta = null) {
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
      ? `Value mismatch: ${conservation.reason} â€” possible non-standard/fee anomaly.`
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
      const valBtc = satsToBtc(sat);
      const inputNodeId = `in_${addr}`;
      seenAddresses.add(addr);
      if (!nodes.some(n => n.id === inputNodeId)) {
        nodes.push(buildInputNode({ addr, scriptStd, satoshis: sat }));
      }
      links.push({ source: inputNodeId, target: txNodeId, value: `${valBtc} BTC`, timestamp: tx.status?.block_time ? new Date(tx.status.block_time * 1000).toLocaleDateString() : 'On-chain', txid: tx.txid, blockTime: tx.status?.block_time || null });
    }
  });

  // Mark depth for hop-decay heuristic
  tx._traceDepth = 0;
  (tx.vout || []).forEach((output, i) => {
    const prep = prepareOutput({ tx, txid: tx.txid, output, outputIndex: i, outspends, inputScriptTypes, seenAddresses, isCoinJoin, addressMeta });
    if (prep.opReturn) {
      nodes.push(buildOpReturnNode({ txId: tx.txid, index: i, payload: prep.opReturn }));
      links.push({ source: txNodeId, target: `op_${tx.txid}_${i}`, value: '0 BTC Data', timestamp: 'Embedded', txid: tx.txid, blockTime: tx.status?.block_time || null });
      return;
    }
    const { addr, valBtc, outNodeId, scriptStd, cls } = prep;

    if (!nodes.some(n => n.id === outNodeId)) {
      const lastActive = cls.kycStatus?.includes('UNSPENT')
        ? (tx.status?.block_time ? new Date(tx.status.block_time * 1000).toLocaleDateString() : 'Active unspent funds')
        : cls.kycStatus?.includes('HISTORICAL') ? 'Historical Transfer'
        : cls.kycStatus?.includes('MIXED') ? 'Mixed funds' : 'Transit';
      nodes.push(buildOutputNode({ outNodeId, addr, valBtc, scriptStd, cls, tx, lastActive, outspendSpent: outspends[i]?.spent }));
    }

    links.push({ source: txNodeId, target: outNodeId, value: `${valBtc} BTC`, timestamp: tx.status?.block_time ? new Date(tx.status.block_time*1000).toLocaleDateString() : 'On-chain', txid: tx.txid, blockTime: tx.status?.block_time || null });
    seenAddresses.add(addr);
  });

  return { nodes, links };
}


