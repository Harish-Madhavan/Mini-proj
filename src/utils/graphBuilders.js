/**
 * Shared node/link builders to deduplicate bitcoinApi format/trace logic
 */

import { satsToBtc } from './forensicUtils';

export function buildTxHubNode({ txId, metrics, isCoinJoin, conservation, depth = null, totalOutSats = null }) {
  const label = isCoinJoin ? `Mixing: ${txId.slice(0, 6)}...` : `Transaction ${txId.slice(0, 8)}...`;
  const entityName = isCoinJoin ? 'Mixing round' : depth != null ? `Step hub (depth ${depth})` : 'Transaction hub';
  // Balance is routed volume (sum of outputs), never the miner fee — downstream
  // taint/fiat math parses `balance`, and fee-as-balance corrupted both.
  const routedBtc = totalOutSats != null ? satsToBtc(totalOutSats) : null;
  return {
    id: `tx_${txId}`,
    label,
    type: isCoinJoin ? 'mixer' : 'hop',
    balance: routedBtc != null ? `${routedBtc} BTC` : `${satsToBtc(metrics?.feeSat || 0)} BTC Fee`,
    risk: isCoinJoin ? 'high' : (!conservation?.valid ? 'medium' : 'low'),
    entityName,
    details: {
      address: txId,
      lastActive: metrics?.blockTime ? new Date(metrics.blockTime * 1000).toISOString().split('T')[0] : (metrics?.blockConfirmation || 'Waiting area'),
      ipLog: 'Bitcoin network',
      kycStatus: isCoinJoin ? 'MIXED FUNDS' : 'ON-CHAIN RECORD',
      feeRateSatVb: metrics ? `${metrics.feeRateSatVb} satoshis per byte` : 'N/A',
      vsize: metrics ? `${metrics.vsize} bytes` : 'N/A',
      rbfStatus: metrics?.isRbfSignaled ? 'Replaceable fee' : 'Final fee',
      confirmations: metrics?.blockConfirmation || 'Unconfirmed',
      riskReason: isCoinJoin ? 'Mixing across inputs — the trail stops here.' : metrics?.riskReason || '',
      isCoinJoin,
      conservation,
      entropy: metrics?.entropy,
      anonymityRatio: metrics?.anonymityRatio,
    }
  };
}

export function buildInputNode({ addr, scriptStd, satoshis }) {
  const valBtc = satsToBtc(satoshis);
  return {
    id: `in_${addr}`,
    label: 'Source Wallet',
    type: 'suspect',
    balance: `${valBtc} BTC`,
    risk: 'high',
    entityName: `Origin Wallet (${addr.slice(0, 6)}...)`,
    details: {
      address: addr,
      lastActive: 'Already spent',
      ipLog: 'Network broadcaster',
      kycStatus: 'UNREGISTERED',
      scriptStandard: scriptStd,
      riskReason: `Input from earlier funds (${scriptStd}).`
    }
  };
}

/**
 * Shared classified-output node builder used by both formatBlockstreamTx and
 * traceEndReceiver — one shape, no drift. Callers pass lastActive since the
 * single-tx formatter dates unspent holders while the tracer uses a static label.
 */
export function buildOutputNode({ outNodeId, addr, valBtc, scriptStd, cls, tx, lastActive }) {
  return {
    id: outNodeId,
    label: cls.label,
    type: cls.nodeType,
    balance: `${valBtc} BTC`,
    risk: cls.risk,
    entityName: cls.entityName,
    details: {
      address: addr,
      lastActive,
      ipLog: cls.ipLog,
      kycStatus: cls.kycStatus,
      scriptStandard: scriptStd,
      riskReason: cls.riskReason,
      heuristicScore: cls.heuristics?.weightedScore,
      heuristicConfidence: cls.confidence,
      heuristicBreakdown: cls.heuristics?.breakdown,
      blockHeight: tx.status?.block_height || null,
      blockTime: tx.status?.block_time || null,
      exchangeConf: cls.exchangeConf,
    }
  };
}

export function buildOpReturnNode({ txId, index, payload }) {
  return {
    id: `op_${txId}_${index}`,
    label: 'Embedded message',
    type: 'hop',
    balance: '0 BTC',
    risk: 'medium',
    entityName: 'Embedded on-chain message',
    details: {
      address: `OP_RETURN:${payload.rawHex.slice(0, 16)}...`,
      lastActive: 'On-chain message',
      ipLog: 'N/A',
      kycStatus: 'DATA NOTE',
      scriptStandard: 'Embedded data (unspendable)',
      opReturnHex: payload.rawHex,
      opReturnDecoded: payload.decodedText || 'Binary content',
      riskReason: `Message data: ${payload.decodedText ? `"${payload.decodedText}"` : payload.rawHex.slice(0, 32)}`
    }
  };
}
