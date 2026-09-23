export const SCENARIOS = [
  {
    id: "case-btc-01",
    title: "BTC Transaction Trace: 4b9a8f2e...",
    subtitle: "Multi-step trace",
    currency: "BTC",
    suspectName: "Origin Address (bc1qxy2...)",
    initialTxHash: "4b9a8f2e71d3c05c8a9f0e1d2c3b4a5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b",
    status: "ACTIVE_TRACE",
    riskScore: 85,
    description: "Traces BTC from the starting wallet through middle steps to an exchange deposit.",
    nodes: [
      {
        id: "addr_suspect",
        label: "Start wallet",
        type: "suspect",
        balance: "14.85 BTC",
        risk: "high",
        entityName: "Origin Address (bc1qxy...)",
        details: {
          address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
          lastActive: "On-chain transaction",
          ipLog: "Bitcoin network",
          kycStatus: "UNKNOWN OWNER (ON-CHAIN)",
          riskReason: "Where the traced money starts."
        }
      },
      {
        id: "addr_hop_1",
        label: "Step 1",
        type: "hop",
        balance: "1.25 BTC",
        risk: "medium",
        entityName: "Intermediate Hop A",
        details: {
          address: "bc1q7w5pxj2lznq48as923kd8mzklaq02947alkwsj",
          lastActive: "Forwarded",
          ipLog: "Intermediate Relay",
          kycStatus: "UNREGISTERED",
          riskReason: "Split pattern matches a change step."
        }
      },
      {
        id: "addr_hop_2",
        label: "Step 2",
        type: "hop",
        balance: "0.12 BTC",
        risk: "medium",
        entityName: "Intermediate Hop B",
        details: {
          address: "bc1qdf4w9sl2lznq48as923kd8mzklaq02947a11122",
          lastActive: "Forwarded",
          ipLog: "Intermediate Proxy",
          kycStatus: "UNREGISTERED",
          riskReason: "Passes value toward the deposit."
        }
      },
      {
        id: "addr_receiver",
        label: "End receiver",
        type: "receiver",
        balance: "9.05 BTC",
        risk: "low",
        entityName: "Exchange account",
        details: {
          address: "3E8tMa9Jkdf923kd8mzklaq02947aWazirX",
          lastActive: "Deposit settled",
          ipLog: "Exchange",
          kycStatus: "EXCHANGE DEPOSIT ADDRESS",
          ownerName: "Exchange Deposit Account",
          email: "compliance-notice@exchange-gateway.io",
          phone: "Exchange",
          kycDocumentId: "SUBPOENA ELIGIBLE",
          riskReason: "Final deposit for the traced payments."
        }
      }
    ],
    links: [
      { source: "addr_suspect", target: "addr_hop_1", value: "10.50 BTC", timestamp: "On-chain" },
      { source: "addr_hop_1", target: "addr_hop_2", value: "9.20 BTC", timestamp: "On-chain" },
      { source: "addr_hop_2", target: "addr_receiver", value: "9.05 BTC", timestamp: "Settled" }
    ]
  },
  {
    id: "case-crosschain-01",
    title: "Cross-Chain Swap: BTC to Ethereum USDT",
    subtitle: "Bridge hopping trace",
    currency: "BTC",
    suspectName: "Suspect Syndicate Alpha",
    initialTxHash: "7c12f49a21b3e8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
    status: "ACTIVE_TRACE",
    riskScore: 92,
    description: "Detects cross-chain laundering via THORChain Asgard Vault with OP_RETURN swap memo settling to Ethereum ERC-20 USDT.",
    nodes: [
      {
        id: "addr_suspect",
        label: "Origin wallet",
        type: "suspect",
        balance: "8.50 BTC",
        risk: "critical",
        entityName: "Suspect Syndicate Alpha",
        details: {
          address: "bc1q999syndicatesuspectoriginwallet77",
          lastActive: "On-chain transfer",
          ipLog: "Tor Exit Relay",
          kycStatus: "NON-KYC ILLICIT SOURCE",
          riskReason: "Narcotics sales revenue liquidation origin."
        }
      },
      {
        id: "addr_layering_hop",
        label: "Layering Hop",
        type: "hop",
        balance: "8.48 BTC",
        risk: "high",
        entityName: "Intermediate Layering Transit",
        details: {
          address: "bc1qtransitlayeringhopwallet55443322",
          lastActive: "Immediate forwarding",
          ipLog: "VPN Node",
          kycStatus: "UNREGISTERED TRANSIT",
          riskReason: "Rapid-spend transit to bridge deposit vault."
        }
      },
      {
        id: "addr_bridge_vault",
        label: "THORChain Vault",
        type: "bridge",
        balance: "8.45 BTC",
        risk: "critical",
        entityName: "THORChain Asgard Vault",
        details: {
          address: "bc1qthorvault9981247asgard001",
          lastActive: "Bridge deposit",
          ipLog: "Decentralized Liquidity Pool",
          kycStatus: "CROSS-CHAIN BRIDGE ROUTER",
          opReturnDecoded: "SWAP:ETH.USDT:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
          scriptStandard: "Native SegWit",
          crossChain: {
            destinationChain: "Ethereum",
            destinationAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
            targetAsset: "USDT",
            protocol: "THORChain"
          },
          riskReason: "Automated chain-hopping bridge without identity checks. Exits Bitcoin mainnet."
        }
      },
      {
        id: "addr_eth_receiver",
        label: "Settlement Endpoint",
        type: "receiver",
        balance: "8.40 BTC eq (≈ 546,000 USDT)",
        risk: "medium",
        entityName: "Ethereum Deposit Account",
        details: {
          address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
          lastActive: "Settled on Ethereum",
          ipLog: "Ethereum Node",
          kycStatus: "EVM ERC-20 RECIPIENT",
          ownerName: "Cross-Chain Tether Recipient",
          kycDocumentId: "MLAT SUBPOENA READY",
          riskReason: "Final cross-chain exit destination on Ethereum."
        }
      }
    ],
    links: [
      { source: "addr_suspect", target: "addr_layering_hop", value: "8.50 BTC", timestamp: "On-chain" },
      { source: "addr_layering_hop", target: "addr_bridge_vault", value: "8.48 BTC", timestamp: "Bridge Deposit" },
      { source: "addr_bridge_vault", target: "addr_eth_receiver", value: "8.40 BTC (Bridged)", timestamp: "Cross-Chain Swap" }
    ]
  }
];
