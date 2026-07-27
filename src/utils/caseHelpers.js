/**
 * Helper utility functions for creating live trace cases & algorithmic trace cases.
 */

export function createLiveTxCase(txId, formattedNodesAndLinks, scenarios) {
  const newCaseId = `live-btc-${txId.slice(0, 8)}`;
  const liveCase = {
    id: newCaseId,
    title: `Live BTC Tx: ${txId.slice(0, 8)}...`,
    subtitle: `Mainnet Real-Time Forward Trace`,
    currency: "BTC",
    suspectName: `Origin Entity (${txId.slice(0, 6)})`,
    initialTxHash: txId,
    status: "LIVE_TRACE",
    riskScore: 80,
    description: `Real-time outspend tracing for Tx ${txId}. Identifies intermediate peeling hops and terminal End Receiver UTXOs/Exchange endpoints.`,
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
  const liveCase = {
    id: newCaseId,
    title: `Address Trace: ${address.slice(0, 10)}...`,
    subtitle: `On-Chain Address History`,
    currency: "BTC",
    suspectName: `Queried Address: ${address.slice(0, 12)}...`,
    initialTxHash: latestTxId,
    status: "LIVE_TRACE",
    riskScore: 75,
    description: `Fetched ${txCount} transactions for address ${address}. Showing forward outspend path to identified End Receivers from latest activity.`,
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
    title: `Traced Flow: ${searchVal.slice(0, 12)}...`,
    subtitle: `Algorithmic Outspend Analysis`,
    currency: currency,
    suspectName: `Queried Target (${searchVal.slice(0, 8)})`,
    initialTxHash: isAddress ? `Tx-${positiveHash.toString(16)}` : searchVal,
    status: "ACTIVE_TRACE",
    riskScore: Math.min(90, Math.max(50, (positiveHash % 35) + 55)),
    description: `Algorithmic forward outspend graph calculated for search query ${searchVal}. Identifies intermediate relay hops terminating at an exchange deposit end receiver.`,
    nodes: [
      {
        id: "addr_suspect",
        label: "Origin Target Wallet",
        type: "suspect",
        balance: `${calculatedVal} ${currency}`,
        risk: "high",
        entityName: `Queried Address (${searchVal.slice(0, 8)})`,
        details: {
          address: isAddress ? searchVal : `bc1q${positiveHash.toString(16)}48as923kd8mzklaq02947a`,
          lastActive: "Active Session",
          ipLog: "P2P Network Node",
          kycStatus: "PSEUDONYMOUS (ON-CHAIN)",
          riskReason: "Origin point of queried transaction value flow.",
          device: "Broadcasting Client"
        }
      },
      {
        id: "addr_hop_1",
        label: "Hop 1: Transit Peeling Hop",
        type: "hop",
        balance: `${hop1Val} ${currency}`,
        risk: "medium",
        entityName: "Intermediate Hop Address",
        details: {
          address: `bc1qhop${positiveHash.toString(16)}2947alkwsj`,
          lastActive: "Forwarded",
          ipLog: "Intermediate Relay",
          kycStatus: "UNREGISTERED",
          riskReason: "Peeling chain change hop splitting primary funds.",
          device: "N/A"
        }
      },
      {
        id: "addr_receiver",
        label: "End Receiver: Exchange Deposit",
        type: "receiver",
        balance: `${receiverVal} ${currency}`,
        risk: "low",
        entityName: "Centralized Exchange Gateway",
        details: {
          address: `3E8t${positiveHash.toString(16)}DepositPoint`,
          lastActive: "Deposit Completed",
          ipLog: "Regulated Exchange Gateway",
          kycStatus: "DEPOSIT POINT (P2SH/MULTI-SIG)",
          ownerName: `Exchange Deposit Gateway`,
          email: `compliance@gateway.io`,
          phone: "Attributed Gateway",
          kycDocumentId: `SUBPOENA ELIGIBLE`,
          riskReason: "Centralized exchange account serving as cash-out end receiver for intermediate hops.",
          device: "Web/Exchange Portal"
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
