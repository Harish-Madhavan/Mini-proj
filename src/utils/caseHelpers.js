import { calculateForensicRiskScore } from './riskScoring';

/**
 * Helper utility functions for creating live trace cases & algorithmic trace cases.
 */

export function calculateDynamicCaseRiskScore(nodes = []) {
  const result = calculateForensicRiskScore(nodes);
  return result.riskScore;
}

export function createLiveTxCase(txId, formattedNodesAndLinks, scenarios) {
  const newCaseId = `live-btc-${txId.slice(0, 8)}`;
  const nodes = formattedNodesAndLinks?.nodes || [];
  if (nodes.length === 0) {
    throw new Error(`No trace data for Tx ${txId.slice(0, 12)}... — refusing to create an empty case`);
  }
  const riskScore = calculateDynamicCaseRiskScore(nodes);
  const isHistorical = nodes.some(n => n.details?.kycStatus?.includes('HISTORICAL'));
  const meta = formattedNodesAndLinks.meta || null;

  const liveCase = {
    id: newCaseId,
    title: `Live trace: ${txId.slice(0, 8)}...`,
    subtitle: isHistorical ? `Early network trace` : `Live forward trace`,
    currency: "BTC",
    suspectName: isHistorical ? `Early sender (${txId.slice(0, 6)})` : `Start (${txId.slice(0, 6)})`,
    initialTxHash: txId,
    status: "LIVE_TRACE",
    riskScore,
    traceMeta: meta,
    description: isHistorical
      ? `Early Bitcoin-era trace for transaction ${txId}. Plain direct transfer.`
      : `Live tracing for transaction ${txId}. Shows middle steps and end receivers (unspent outputs / exchange deposits).${meta?.confidence ? ` Trace confidence ${(meta.confidence*100).toFixed(0)}% (${meta.confidenceLevel}).` : ''}${meta?.haltReason ? ` Halt: ${meta.haltReason}.` : ''}`,
    nodes: formattedNodesAndLinks.nodes,
    links: formattedNodesAndLinks.links
  };

  return {
    newCaseId,
    scenarios: [liveCase, ...scenarios.filter(s => s.id !== newCaseId)]
  };
}

export function createAddressTraceCase(address, txCount, latestTxId, formattedNodesAndLinks, scenarios) {
  const newCaseId = `addr-btc-${address.slice(0, 8)}`;
  const nodes = formattedNodesAndLinks?.nodes || [];
  if (nodes.length === 0) {
    throw new Error(`No trace data for address ${address.slice(0, 16)}... — refusing to create an empty case`);
  }
  const riskScore = calculateDynamicCaseRiskScore(nodes);
  const isHistorical = nodes.some(n => n.details?.kycStatus?.includes('HISTORICAL'));
  const meta = formattedNodesAndLinks.meta || null;

  const liveCase = {
    id: newCaseId,
    title: `Address trace: ${address.slice(0, 10)}...`,
    subtitle: `Address history`,
    currency: "BTC",
    suspectName: `Checked address: ${address.slice(0, 12)}...`,
    initialTxHash: latestTxId,
    status: "LIVE_TRACE",
    riskScore,
    traceMeta: meta,
    description: isHistorical
      ? `Early Bitcoin-era address ${address} (${txCount} transactions). Plain historical transfer.`
      : `Fetched ${txCount} transactions for address ${address}. Shows the money path from latest activity to end receivers.${meta?.confidence ? ` Confidence ${(meta.confidence*100).toFixed(0)}%.` : ''}`,
    nodes: formattedNodesAndLinks.nodes,
    links: formattedNodesAndLinks.links
  };

  return {
    newCaseId,
    scenarios: [liveCase, ...scenarios.filter(s => s.id !== newCaseId)]
  };
}

export function createAlgorithmicTraceCase(searchVal, scenarios) {
  const isAddress = searchVal.startsWith('bc1') || searchVal.startsWith('0x') || searchVal.startsWith('T') || searchVal.startsWith('1') || searchVal.startsWith('3');
  const currency = searchVal.startsWith('0x') ? 'ETH' : searchVal.startsWith('T') ? 'USDT (TRC20)' : 'BTC';
  
  // Deterministic hash computation from search value
  let hashVal = 0;
  for (let i = 0; i < searchVal.length; i++) {
    hashVal = (hashVal << 5) - hashVal + searchVal.charCodeAt(i);
    hashVal |= 0;
  }
  const positiveHash = Math.abs(hashVal);
  const calculatedVal = ((positiveHash % 1500 + 100) / 100).toFixed(2);
  const hop1Val = (calculatedVal * 0.75).toFixed(2);
  const receiverVal = (calculatedVal * 0.73).toFixed(2);

  const newCaseId = `case-trace-${positiveHash.toString(16)}`;
  const customCase = {
    id: newCaseId,
    title: `Trace: ${searchVal.slice(0, 12)}...`,
    subtitle: `Estimated trace`,
    currency: currency,
    suspectName: `Checked target (${searchVal.slice(0, 8)})`,
    initialTxHash: isAddress ? `Tx-${positiveHash.toString(16)}` : searchVal,
    status: "ACTIVE_TRACE",
    riskScore: Math.min(90, Math.max(50, (positiveHash % 35) + 55)),
    description: `Estimated payment graph for ${searchVal}. Shows middle steps ending at an exchange deposit.`,
    nodes: [
      {
        id: "addr_suspect",
        label: "Start wallet",
        type: "suspect",
        balance: `${calculatedVal} ${currency}`,
        risk: "high",
        entityName: `Checked address (${searchVal.slice(0, 8)})`,
        details: {
          address: isAddress ? searchVal : `bc1q${positiveHash.toString(16)}48as923kd8mzklaq02947a`,
          lastActive: "Active now",
          ipLog: "Bitcoin network",
          kycStatus: "UNKNOWN OWNER (ON-CHAIN)",
          riskReason: "Where the traced money starts."
        }
      },
      {
        id: "addr_hop_1",
        label: "Step 1",
        type: "hop",
        balance: `${hop1Val} ${currency}`,
        risk: "medium",
        entityName: "Middle wallet",
        details: {
          address: `bc1qhop${positiveHash.toString(16)}2947alkwsj`,
          lastActive: "Forwarded",
          ipLog: "Intermediate Relay",
          kycStatus: "UNREGISTERED",
          riskReason: "Middle step splitting the main funds."
        }
      },
      {
        id: "addr_receiver",
        label: "End receiver",
        type: "receiver",
        balance: `${receiverVal} ${currency}`,
        risk: "low",
        entityName: "Exchange account",
        details: {
          address: `3E8t${positiveHash.toString(16)}DepositPoint`,
          lastActive: "Deposit done",
          ipLog: "Exchange",
          kycStatus: "EXCHANGE DEPOSIT ADDRESS",
          ownerName: `Exchange account`,
          email: `compliance@gateway.io`,
          phone: "Exchange",
          kycDocumentId: `SUBPOENA ELIGIBLE`,
          riskReason: "Exchange account where the traced payments end."
        }
      }
    ],
    links: [
      { source: "addr_suspect", target: "addr_hop_1", value: `${hop1Val} ${currency}`, timestamp: "On-chain" },
      { source: "addr_hop_1", target: "addr_receiver", value: `${receiverVal} ${currency}`, timestamp: "Settled" }
    ]
  };

  return {
    newCaseId,
    scenarios: [customCase, ...scenarios.filter(s => s.id !== newCaseId)]
  };
}

export function createCustomInvestigationCase(newCaseData) {
  const caseId = `case-custom-${Date.now().toString(36)}`;
  const suspectAddr = newCaseData.suspectAddress || 'bc1q999customtargetaddressforensicset';
  const amount = newCaseData.amount || '5.5000 BTC';
  const receiverAddr = newCaseData.receiverAddress || 'bc1qdepositaddressforensictarget999';

  return {
    id: caseId,
    title: newCaseData.title || `Custom Case ${caseId.slice(-6).toUpperCase()}`,
    currency: "BTC",
    initialTxHash: newCaseData.txHash || "custom_tx_hash_placeholder",
    suspectName: newCaseData.suspectName || "Custom target",
    description: newCaseData.description || "Manually assembled case.",
    riskScore: newCaseData.riskScore || 85,
    nodes: [
      {
        id: "custom_suspect",
        label: "Start",
        type: "suspect",
        entityName: newCaseData.suspectName || "Target person",
        balance: amount,
        risk: "critical",
        details: {
          address: suspectAddr,
          ipLog: "103.241.12.89",
          lastActive: "Recent activity",
          kycStatus: "NO IDENTITY RECORD",
          scriptStandard: "Native SegWit",
          riskReason: "Starting wallet from the initial notes."
        }
      },
      {
        id: "custom_hop_1",
        label: "Step 1",
        type: "hop",
        entityName: "Middle wallet",
        balance: amount,
        risk: "medium",
        details: {
          address: `bc1qhop${Date.now().toString(36)}transithopaddr`,
          ipLog: "Network relay",
          lastActive: "Passing funds on",
          kycStatus: "UNLINKED FUNDS",
          scriptStandard: "SegWit script",
          riskReason: "Middle address splitting funds."
        }
      },
      {
        id: "custom_receiver",
        label: "End receiver",
        type: "receiver",
        entityName: newCaseData.targetExchange || "Exchange deposit",
        balance: amount,
        risk: "low",
        details: {
          address: receiverAddr,
          ipLog: "122.161.49.5",
          lastActive: "Active deposit",
          kycStatus: "SUBPOENA READY (IDENTITY ON FILE)",
          ownerName: "Account holder on file",
          kycDocumentId: "NCB-SUBPOENA-REF",
          scriptStandard: "Script address (P2SH)",
          riskReason: "End deposit at a government-registered exchange with identity records."
        }
      }
    ],
    links: [
      {
        source: "custom_suspect",
        target: "custom_hop_1",
        value: amount,
        timestamp: "Block Confirmed"
      },
      {
        source: "custom_hop_1",
        target: "custom_receiver",
        value: amount,
        timestamp: "Settlement Confirmed"
      }
    ]
  };
}

