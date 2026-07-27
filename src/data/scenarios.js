export const SCENARIOS = [
  {
    id: "case-btc-01",
    title: "BTC Transaction Trace: 4b9a8f2e...",
    subtitle: "On-Chain Multi-Hop Peeling Analysis",
    currency: "BTC",
    suspectName: "Origin Address (bc1qxy2...)",
    initialTxHash: "4b9a8f2e71d3c05c8a9f0e1d2c3b4a5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b",
    status: "ACTIVE_TRACE",
    riskScore: 85,
    description: "On-chain outspend analysis tracing BTC value movement from origin inputs through intermediate peeling change hops to an exchange deposit endpoint.",
    nodes: [
      {
        id: "addr_suspect",
        label: "Origin Input Wallet",
        type: "suspect",
        balance: "14.85 BTC",
        risk: "high",
        entityName: "Origin Address (bc1qxy...)",
        details: {
          address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
          lastActive: "On-chain Transaction",
          ipLog: "P2P Network Node",
          kycStatus: "PSEUDONYMOUS (ON-CHAIN)",
          riskReason: "Origin point of queried transaction value flow.",
          device: "Bitcoin Client"
        }
      },
      {
        id: "addr_hop_1",
        label: "Hop 1: Peeling Change Wallet",
        type: "hop",
        balance: "1.25 BTC",
        risk: "medium",
        entityName: "Intermediate Hop A",
        details: {
          address: "bc1q7w5pxj2lznq48as923kd8mzklaq02947alkwsj",
          lastActive: "Forwarded",
          ipLog: "Intermediate Relay",
          kycStatus: "UNREGISTERED",
          riskReason: "Transaction structure matches peeling chain change hop.",
          device: "N/A"
        }
      },
      {
        id: "addr_hop_2",
        label: "Hop 2: Intermediate Hop",
        type: "hop",
        balance: "0.12 BTC",
        risk: "medium",
        entityName: "Intermediate Hop B",
        details: {
          address: "bc1qdf4w9sl2lznq48as923kd8mzklaq02947a11122",
          lastActive: "Forwarded",
          ipLog: "Intermediate Proxy",
          kycStatus: "UNREGISTERED",
          riskReason: "Pass-through layer routing value to deposit destination.",
          device: "N/A"
        }
      },
      {
        id: "addr_receiver",
        label: "End Receiver: Exchange Deposit",
        type: "receiver",
        balance: "9.05 BTC",
        risk: "low",
        entityName: "Centralized Exchange Gateway",
        details: {
          address: "3E8tMa9Jkdf923kd8mzklaq02947aWazirX",
          lastActive: "Deposit Settled",
          ipLog: "Regulated Gateway Node",
          kycStatus: "DEPOSIT POINT (P2SH/MULTI-SIG)",
          ownerName: "Exchange Deposit Account",
          email: "compliance-notice@exchange-gateway.io",
          phone: "Attributed Gateway",
          kycDocumentId: "SUBPOENA ELIGIBLE",
          riskReason: "Terminal deposit point for intermediate outspends.",
          device: "Web API Gateway"
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
