/**
 * Shared node/link builders to deduplicate bitcoinApi format/trace logic
 */

export function buildTxHubNode({ txId, metrics, isCoinJoin, conservation, depth = null }) {
  const label = isCoinJoin ? `CoinJoin: ${txId.slice(0, 6)}...` : `Tx: ${txId.slice(0, 8)}...`;
  const entityName = isCoinJoin ? 'CoinJoin Privacy Mixer Round' : depth != null ? `Hop Hub (Depth ${depth})` : 'On-Chain Tx Hub';
  return {
    id: `tx_${txId}`,
    label,
    type: isCoinJoin ? 'mixer' : 'hop',
    balance: `${((metrics?.feeSat || 0) / 100000000).toFixed(6)} BTC Fee`,
    risk: isCoinJoin ? 'high' : (!conservation?.valid ? 'medium' : 'low'),
    entityName,
    details: {
      address: txId,
      lastActive: metrics?.blockTime ? new Date(metrics.blockTime * 1000).toISOString().split('T')[0] : (metrics?.blockConfirmation || 'Mempool'),
      ipLog: 'Bitcoin P2P Network',
      kycStatus: isCoinJoin ? 'PRIVACY MIXER (COINJOIN)' : 'ON-CHAIN TRANSACTION',
      feeRateSatVb: metrics ? `${metrics.feeRateSatVb} sat/vB` : 'N/A',
      vsize: metrics ? `${metrics.vsize} vB` : 'N/A',
      rbfStatus: metrics?.isRbfSignaled ? 'RBF Enabled' : 'Final (No RBF)',
      confirmations: metrics?.blockConfirmation || 'Unconfirmed',
      riskReason: isCoinJoin ? 'CoinJoin mixing across inputs — taint broken.' : metrics?.riskReason || '',
      device: 'Bitcoin Protocol',
      isCoinJoin,
      conservation,
      entropy: metrics?.entropy,
      anonymityRatio: metrics?.anonymityRatio,
    }
  };
}

export function buildInputNode({ addr, scriptStd, satoshis }) {
  const valBtc = ((satoshis || 0) / 100000000).toFixed(6);
  return {
    id: `in_${addr}`,
    label: 'Source Wallet',
    type: 'suspect',
    balance: `${valBtc} BTC`,
    risk: 'high',
    entityName: `Origin Wallet (${addr.slice(0, 6)}...)`,
    details: {
      address: addr,
      lastActive: 'Spent UTXO',
      ipLog: 'P2P Broadcast Node',
      kycStatus: 'UNREGISTERED',
      scriptStandard: scriptStd,
      riskReason: `Input UTXO contributor (${scriptStd}).`,
      device: 'Bitcoin Client'
    }
  };
}

export function buildOpReturnNode({ txId, index, payload }) {
  return {
    id: `op_${txId}_${index}`,
    label: 'OP_RETURN Data',
    type: 'hop',
    balance: '0 BTC',
    risk: 'medium',
    entityName: 'Embedded OP_RETURN Payload',
    details: {
      address: `OP_RETURN:${payload.rawHex.slice(0, 16)}...`,
      lastActive: 'On-chain Payload',
      ipLog: 'N/A',
      kycStatus: 'NULL DATA SCRIPT',
      scriptStandard: 'OP_RETURN (Unspendable)',
      opReturnHex: payload.rawHex,
      opReturnDecoded: payload.decodedText || 'Binary Payload',
      riskReason: `Null-data: ${payload.decodedText ? `"${payload.decodedText}"` : payload.rawHex.slice(0, 32)}`
    }
  };
}
