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
          riskReason: "Where the traced money starts.",
          device: "Wallet software"
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
          riskReason: "Split pattern matches a change step.",
          device: "N/A"
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
          riskReason: "Passes value toward the deposit.",
          device: "N/A"
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
          riskReason: "Final deposit for the traced payments.",
          device: "Exchange website"
        }
      }
    ],
    links: [
      { source: "addr_suspect", target: "addr_hop_1", value: "10.50 BTC", timestamp: "On-chain" },
      { source: "addr_hop_1", target: "addr_hop_2", value: "9.20 BTC", timestamp: "On-chain" },
      { source: "addr_hop_2", target: "addr_receiver", value: "9.05 BTC", timestamp: "Settled" }
    ]
  }
];
