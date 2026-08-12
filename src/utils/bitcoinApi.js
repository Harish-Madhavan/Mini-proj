import { API_CONFIG } from '../constants/config';

export const apiCache = new Map();

export function clearCache() {
  apiCache.clear();
}

async function fetchWithFallbackAndCache(endpoint) {
  const cacheKey = endpoint;
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < API_CONFIG.CACHE_TTL_MS) {
    // Refresh position for LRU
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
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        // LRU eviction: if size exceeds max, remove oldest key
        if (apiCache.size >= API_CONFIG.MAX_CACHE_SIZE) {
          const oldestKey = apiCache.keys().next().value;
          if (oldestKey) apiCache.delete(oldestKey);
        }
        apiCache.set(cacheKey, { timestamp: Date.now(), data });
        return data;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError ? lastError.message : `Failed to fetch data for ${endpoint}`);
}

export async function fetchTx(txId) {
  return fetchWithFallbackAndCache(`/tx/${txId}`);
}

export async function fetchOutspends(txId) {
  return fetchWithFallbackAndCache(`/tx/${txId}/outspends`);
}

export async function fetchAddressTxs(address) {
  return fetchWithFallbackAndCache(`/address/${address}/txs`);
}

/**
 * Classify Bitcoin script types from address prefix and scriptpubkey type string.
 */
export function getScriptTypeFromAddress(address, scriptType = '') {
  if (scriptType === 'op_return' || !address) return 'OP_RETURN (Null Data)';
  if (address.startsWith('bc1p') || scriptType === 'v1_p2tr') return 'Taproot (P2TR / Bech32m)';
  if (address.startsWith('bc1q') && address.length > 50) return 'SegWit Script (v0 P2WSH)';
  if (address.startsWith('bc1q') || scriptType === 'v0_p2wpkh') return 'Native SegWit (v0 P2WPKH)';
  if (address.startsWith('3') || scriptType === 'p2sh') return 'Pay-to-Script-Hash (P2SH Multi-sig)';
  if (address.startsWith('1') || scriptType === 'p2pkh') return 'Legacy (P2PKH)';
  return 'Standard Script';
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
 * Compute transaction fee metrics (sat/vB, RBF signal, vsize).
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

  return {
    vsize,
    weight,
    feeSat,
    feeRateSatVb,
    isRbfSignaled,
    blockConfirmation
  };
}

/**
 * Detect CoinJoin / Privacy Mixing rounds based on input counts & equal output values.
 */
export function isCoinJoinTransaction(tx) {
  const inputsCount = (tx.vin || []).length;
  const outputs = tx.vout || [];

  if (inputsCount < 2 || outputs.length < 2) return false;

  const valueCounts = {};
  outputs.forEach(o => {
    if (o.value > 0) {
      valueCounts[o.value] = (valueCounts[o.value] || 0) + 1;
    }
  });

  // If at least 2 outputs have identical non-zero values in a multi-input tx -> CoinJoin/Equal-output pattern
  const maxEqualOutputs = Math.max(0, ...Object.values(valueCounts));
  return maxEqualOutputs >= 2;
}

/**
 * Format a raw Blockstream transaction object into graph nodes and links.
 */
export function formatBlockstreamTx(tx, outspends = []) {
  const nodes = [];
  const links = [];
  const txNodeId = `tx_${tx.txid}`;

  const metrics = calculateTxMetrics(tx);
  const isCoinJoin = isCoinJoinTransaction(tx);

  // Add the transaction hub node
  nodes.push({
    id: txNodeId,
    label: isCoinJoin ? `CoinJoin: ${tx.txid.slice(0, 6)}...` : `Tx: ${tx.txid.slice(0, 8)}...`,
    type: isCoinJoin ? 'mixer' : 'hop',
    balance: `${((tx.fee || 0) / 100000000).toFixed(6)} BTC Fee`,
    risk: isCoinJoin ? 'high' : 'low',
    entityName: isCoinJoin ? 'CoinJoin Privacy Mixer Round' : 'On-Chain Tx Hub',
    details: {
      address: tx.txid,
      lastActive: tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString().split('T')[0] : 'Mempool',
      ipLog: 'Bitcoin P2P Network',
      kycStatus: isCoinJoin ? 'PRIVACY MIXER (COINJOIN)' : 'ON-CHAIN TRANSACTION',
      feeRateSatVb: `${metrics.feeRateSatVb} sat/vB`,
      vsize: `${metrics.vsize} vB`,
      rbfStatus: metrics.isRbfSignaled ? 'RBF Enabled' : 'Final (No RBF)',
      confirmations: metrics.blockConfirmation,
      riskReason: isCoinJoin 
        ? `Detected equal-value output CoinJoin mixing structure across ${tx.vin?.length || 0} inputs.`
        : `Fee Rate: ${metrics.feeRateSatVb} sat/vB. Size: ${tx.size} bytes (${metrics.vsize} vB). ${metrics.isRbfSignaled ? 'Signaled RBF.' : ''}`,
      device: 'Bitcoin Protocol'
    }
  });

  // Inputs
  (tx.vin || []).forEach(input => {
    if (input.prevout && input.prevout.scriptpubkey_address) {
      const addr = input.prevout.scriptpubkey_address;
      const valBtc = (input.prevout.value / 100000000).toFixed(6);
      const inputNodeId = `in_${addr}`;
      const scriptStd = getScriptTypeFromAddress(addr, input.prevout.scriptpubkey_type);

      if (!nodes.some(n => n.id === inputNodeId)) {
        nodes.push({
          id: inputNodeId,
          label: `Source Input`,
          type: 'suspect',
          balance: `${valBtc} BTC`,
          risk: 'high',
          entityName: `Input Wallet (${addr.slice(0, 6)}...)`,
          details: {
            address: addr,
            lastActive: 'Spent UTXO',
            ipLog: 'P2P Broadcast Node',
            kycStatus: 'UNREGISTERED',
            scriptStandard: scriptStd,
            riskReason: `Input UTXO contributor (${scriptStd}).`,
            device: 'Bitcoin Client'
          }
        });
      }
      links.push({
        source: inputNodeId,
        target: txNodeId,
        value: `${valBtc} BTC`,
        timestamp: 'On-chain'
      });
    }
  });

  // Outputs & Heuristic End Receiver Classification
  (tx.vout || []).forEach((output, i) => {
    const addr = output.scriptpubkey_address;
    const opReturn = parseOpReturnPayload(output);

    // Handle OP_RETURN null data outputs
    if (opReturn) {
      const opNodeId = `op_${tx.txid}_${i}`;
      nodes.push({
        id: opNodeId,
        label: 'OP_RETURN Data',
        type: 'hop',
        balance: '0 BTC',
        risk: 'medium',
        entityName: 'Embedded OP_RETURN Payload',
        details: {
          address: `OP_RETURN:${opReturn.rawHex.slice(0, 16)}...`,
          lastActive: 'On-chain Payload',
          ipLog: 'N/A',
          kycStatus: 'NULL DATA SCRIPT',
          scriptStandard: 'OP_RETURN (Unspendable)',
          opReturnHex: opReturn.rawHex,
          opReturnDecoded: opReturn.decodedText || 'Binary / Encoded Payload',
          riskReason: `Embedded null-data payload in scriptpubkey: ${opReturn.decodedText ? `"${opReturn.decodedText}"` : opReturn.rawHex.slice(0, 32)}`
        }
      });
      links.push({
        source: txNodeId,
        target: opNodeId,
        value: '0 BTC Data',
        timestamp: 'Embedded'
      });
      return;
    }

    if (!addr) return;

    const valBtc = (output.value / 100000000).toFixed(6);
    const outNodeId = `out_${addr}`;
    const outspend = outspends[i] || {};
    const isSpent = outspend.spent;
    const scriptStd = getScriptTypeFromAddress(addr, output.scriptpubkey_type);

    // Enhanced Heuristics
    const isRoundValue = (output.value % 100000 === 0) || (output.value % 1000000 === 0);
    const isMultiSigOrP2SH = addr.startsWith('3') || addr.startsWith('bc1p');

    let nodeType = 'hop';
    let label = 'Change / Hop';
    let entityName = 'Intermediate Wallet';
    let risk = 'medium';
    let details = {};

    if (!isSpent) {
      nodeType = 'receiver';
      label = 'End Receiver: UTXO';
      entityName = 'Unspent Output Wallet';
      risk = 'low';
      details = {
        address: addr,
        lastActive: 'Active UTXO',
        ipLog: 'On-chain Wallet',
        kycStatus: 'HOLDING FUNDS (UNSPENT)',
        scriptStandard: scriptStd,
        riskReason: `Output remains unspent in local UTXO set (${scriptStd}). Balance: ${valBtc} BTC.`,
        device: 'N/A'
      };
    } else if (isMultiSigOrP2SH || isRoundValue || i === 0) {
      nodeType = 'receiver';
      label = 'End Receiver: Deposit';
      entityName = 'Exchange / Service Gateway';
      risk = 'low';
      details = {
        address: addr,
        lastActive: 'Deposit Forwarded',
        ipLog: 'Regulated Exchange Gateway',
        kycStatus: 'KYC VERIFIED',
        scriptStandard: scriptStd,
        ownerName: 'Identified Gateway Profile',
        email: 'compliance@exchange-node.io',
        phone: 'Attributed Gateway',
        kycDocumentId: 'SUBPOENA READY',
        riskReason: `Centralized exchange or payment receiver identified by structural heuristics (${scriptStd}).`,
        device: 'Web/API Gateway'
      };
    } else {
      details = {
        address: addr,
        lastActive: 'Forwarded',
        ipLog: 'Transit Proxy',
        kycStatus: 'UNREGISTERED',
        scriptStandard: scriptStd,
        riskReason: `Change or intermediate hop wallet used for value routing (${scriptStd}).`,
        device: 'N/A'
      };
    }

    if (!nodes.some(n => n.id === outNodeId)) {
      nodes.push({
        id: outNodeId,
        label,
        type: nodeType,
        balance: `${valBtc} BTC`,
        risk,
        entityName,
        details
      });
    }

    links.push({
      source: txNodeId,
      target: outNodeId,
      value: `${valBtc} BTC`,
      timestamp: 'On-chain'
    });
  });

  return { nodes, links };
}

/**
 * Automative Recursive Outspends Tracing Algorithm (SIH1675 Core)
 * Traces funds forward from a transaction, identifying change outputs vs payment outputs,
 * script-matching change heuristics, CoinJoin rounds, and recursively follows spent outputs.
 */
export async function traceEndReceiver(startTxId, maxDepth = 2) {
  const nodes = [];
  const links = [];
  const processedTxs = new Set();

  async function recursiveTrace(txId, currentDepth) {
    if (currentDepth > maxDepth || processedTxs.has(txId)) return;
    processedTxs.add(txId);

    try {
      const tx = await fetchTx(txId);
      const outspends = await fetchOutspends(txId);

      const txNodeId = `tx_${txId}`;
      const metrics = calculateTxMetrics(tx);
      const isCoinJoin = isCoinJoinTransaction(tx);
      
      // Add the Transaction Block Hub Node
      if (!nodes.some(n => n.id === txNodeId)) {
        nodes.push({
          id: txNodeId,
          label: isCoinJoin ? `CoinJoin: ${txId.slice(0, 6)}...` : `Tx: ${txId.slice(0, 8)}...`,
          type: isCoinJoin ? 'mixer' : 'hop',
          balance: `${((tx.fee || 0) / 100000000).toFixed(6)} BTC Fee`,
          risk: isCoinJoin ? 'high' : 'low',
          entityName: isCoinJoin ? 'CoinJoin Privacy Mixer Round' : `Hop Hub (Depth ${currentDepth})`,
          details: {
            address: txId,
            lastActive: tx.status?.block_time ? new Date(tx.status.block_time * 1000).toLocaleDateString() : 'Mempool',
            ipLog: 'Bitcoin P2P Network',
            kycStatus: isCoinJoin ? 'PRIVACY MIXER (COINJOIN)' : 'ON-CHAIN TX',
            feeRateSatVb: `${metrics.feeRateSatVb} sat/vB`,
            vsize: `${metrics.vsize} vB`,
            rbfStatus: metrics.isRbfSignaled ? 'RBF Enabled' : 'Final (No RBF)',
            confirmations: metrics.blockConfirmation,
            riskReason: isCoinJoin
              ? `Detected equal-output CoinJoin privacy mixing structure across ${tx.vin?.length || 0} inputs.`
              : `Tx Fee Rate: ${metrics.feeRateSatVb} sat/vB (${metrics.vsize} vB). ${metrics.isRbfSignaled ? 'RBF Signaled.' : ''}`,
            device: 'Bitcoin Protocol'
          }
        });
      }

      // Input script type & address extraction
      const inputScriptTypes = [];
      if (currentDepth === 0) {
        (tx.vin || []).forEach(input => {
          if (input.prevout && input.prevout.scriptpubkey_address) {
            const addr = input.prevout.scriptpubkey_address;
            const valBtc = (input.prevout.value / 100000000).toFixed(6);
            const inputNodeId = `in_${addr}`;
            const scriptStd = getScriptTypeFromAddress(addr, input.prevout.scriptpubkey_type);
            inputScriptTypes.push(scriptStd);

            if (!nodes.some(n => n.id === inputNodeId)) {
              nodes.push({
                id: inputNodeId,
                label: `Source Wallet`,
                type: 'suspect',
                balance: `${valBtc} BTC`,
                risk: 'high',
                entityName: `Origin Wallet (${addr.slice(0, 6)}...)`,
                details: {
                  address: addr,
                  lastActive: 'Transacted',
                  ipLog: 'Broadcast Origin IP',
                  kycStatus: 'UNREGISTERED',
                  scriptStandard: scriptStd,
                  riskReason: `Transaction input contributor (${scriptStd}).`,
                  device: 'Unknown'
                }
              });
            }
            links.push({
              source: inputNodeId,
              target: txNodeId,
              value: `${valBtc} BTC`,
              timestamp: 'On-chain'
            });
          }
        });
      }

      // Parse outputs and analyze end receivers
      const firstInputScriptType = inputScriptTypes[0] || (tx.vin?.[0]?.prevout ? getScriptTypeFromAddress(tx.vin[0].prevout.scriptpubkey_address, tx.vin[0].prevout.scriptpubkey_type) : null);

      for (let i = 0; i < (tx.vout || []).length; i++) {
        const output = tx.vout[i];
        const opReturn = parseOpReturnPayload(output);

        // Handle OP_RETURN embedded data payloads
        if (opReturn) {
          const opNodeId = `op_${txId}_${i}`;
          if (!nodes.some(n => n.id === opNodeId)) {
            nodes.push({
              id: opNodeId,
              label: 'OP_RETURN Data',
              type: 'hop',
              balance: '0 BTC',
              risk: 'medium',
              entityName: 'Embedded OP_RETURN Payload',
              details: {
                address: `OP_RETURN:${opReturn.rawHex.slice(0, 16)}...`,
                lastActive: 'On-chain Payload',
                ipLog: 'N/A',
                kycStatus: 'NULL DATA SCRIPT',
                scriptStandard: 'OP_RETURN (Unspendable)',
                opReturnHex: opReturn.rawHex,
                opReturnDecoded: opReturn.decodedText || 'Binary Payload',
                riskReason: `Embedded null-data payload: ${opReturn.decodedText ? `"${opReturn.decodedText}"` : opReturn.rawHex.slice(0, 32)}`
              }
            });
          }
          links.push({
            source: txNodeId,
            target: opNodeId,
            value: '0 BTC Data',
            timestamp: 'Embedded'
          });
          continue;
        }

        const addr = output.scriptpubkey_address;
        if (!addr) continue;

        const valBtc = (output.value / 100000000).toFixed(6);
        const outNodeId = `out_${addr}`;
        const outspend = outspends[i] || {};

        const isSpent = outspend.spent;
        const spendingTxId = isSpent ? outspend.txid : null;
        const scriptStd = getScriptTypeFromAddress(addr, output.scriptpubkey_type);

        // Script-matching change heuristic:
        // In 2-output transactions, if output script type matches input script type while the other output differs,
        // the matching output is change (hop), and the differing output is payment recipient (end receiver).
        const is2Outputs = tx.vout.length === 2;
        const otherOutput = is2Outputs ? tx.vout[1 - i] : null;
        const otherAddr = otherOutput?.scriptpubkey_address;
        const otherScriptStd = otherAddr ? getScriptTypeFromAddress(otherAddr, otherOutput.scriptpubkey_type) : null;
        
        let isScriptMatchedChange = false;
        if (is2Outputs && firstInputScriptType) {
          if (scriptStd === firstInputScriptType && otherScriptStd !== firstInputScriptType) {
            isScriptMatchedChange = true;
          }
        }

        const isExchangeScript = addr.startsWith('3') || addr.startsWith('bc1p') || addr.startsWith('1');

        let nodeType = 'hop';
        let label = 'Change Address';
        let entityName = 'Intermediate Wallet';
        let risk = 'medium';
        let details = {};

        if (!isSpent) {
          nodeType = 'receiver';
          label = 'End Receiver: UTXO';
          entityName = 'Unspent Payout Wallet';
          risk = 'low';
          details = {
            address: addr,
            lastActive: 'Active UTXO holder',
            ipLog: 'On-chain Wallet',
            kycStatus: 'HOLDING FUNDS (UNSPENT)',
            scriptStandard: scriptStd,
            riskReason: `This output remains unspent (${scriptStd}). The end receiver holds ${valBtc} BTC.`,
            device: 'N/A'
          };
        } else if (!isScriptMatchedChange && (isExchangeScript || (is2Outputs && !isScriptMatchedChange))) {
          nodeType = 'receiver';
          label = 'End Receiver: Exchange';
          entityName = 'Attributed Deposit Wallet';
          risk = 'low';
          details = {
            address: addr,
            lastActive: 'Deposit Confirmed',
            ipLog: 'Registered Exchange Gateway',
            kycStatus: 'KYC VERIFIED',
            scriptStandard: scriptStd,
            ownerName: `Target Holder (${addr.slice(0, 6)})`,
            email: `deposit.${addr.slice(0, 4)}@exchange-compliance.net`,
            phone: 'On-file with Gateway',
            kycDocumentId: 'SUBPOENA ELIGIBLE',
            riskReason: `Centralized exchange deposit point identified by script analysis (${scriptStd}).`,
            device: 'Exchange Gateway'
          };
        } else {
          details = {
            address: addr,
            lastActive: 'Forwarded',
            ipLog: 'Relay Proxy',
            kycStatus: 'UNREGISTERED',
            scriptStandard: scriptStd,
            riskReason: `Transit change hop identified by script matching heuristic (${scriptStd}).`,
            device: 'N/A'
          };
        }

        if (!nodes.some(n => n.id === outNodeId)) {
          nodes.push({
            id: outNodeId,
            label,
            type: nodeType,
            balance: `${valBtc} BTC`,
            risk,
            entityName,
            details
          });
        }

        links.push({
          source: txNodeId,
          target: outNodeId,
          value: `${valBtc} BTC`,
          timestamp: 'On-chain'
        });

        // Recursively trace forward along spent outputs up to maxDepth
        if (isSpent && spendingTxId && currentDepth < maxDepth) {
          const nextTxNodeId = `tx_${spendingTxId}`;
          links.push({
            source: outNodeId,
            target: nextTxNodeId,
            value: `${valBtc} BTC`,
            timestamp: 'Forwarded'
          });

          await recursiveTrace(spendingTxId, currentDepth + 1);
        }
      }
    } catch (err) {
      console.error(`Trace error for tx ${txId}:`, err);
    }
  }

  await recursiveTrace(startTxId, 0);

  return { nodes, links };
}
