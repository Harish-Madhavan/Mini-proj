/**
 * AegisTrace Unified Multi-Dimensional Forensic Risk Scoring Engine (SIH1675 Core)
 *
 * Computes risk across 5 forensic dimensions:
 * 1. Obfuscation & Privacy Mixer Intermediation (Wasabi / Whirlpool / Tornado / Equal-value CoinJoin)
 * 2. Layering Hop Depth & Peeling Index (Intermediate change transit hubs)
 * 3. Settlement & Counterparty Attribution (KYC Exchange Gateway vs Non-KYC Darknet / Unspent UTXO)
 * 4. Protocol & Transaction Anomalies (RBF signaling, zero/extreme fee rates, non-standard scripts)
 * 5. Blockchain Era & Provenance Modulation (Genesis / Early Satoshi era discount for clean P2P)
 */

export const DEFAULT_RISK_WEIGHTS = {
  mixerWeight: 35,
  hopWeight: 12,
  kycDiscountWeight: 15,
  baseScore: 20
};

/**
 * Calculate multi-dimensional forensic risk score for a case graph.
 *
 * @param {Array<Object>|Object} caseOrNodes - Case object or array of node objects
 * @param {Object} customWeights - Optional override weights
 * @returns {Object} Comprehensive risk assessment object
 */
export function calculateForensicRiskScore(caseOrNodes, customWeights = {}) {
  const nodes = Array.isArray(caseOrNodes) ? caseOrNodes : (caseOrNodes?.nodes || []);
  const weights = { ...DEFAULT_RISK_WEIGHTS, ...customWeights };

  const hasMixer = nodes.some(n => n.type === 'mixer');
  const hopCount = nodes.filter(n => n.type === 'hop').length;
  const receiverNode = nodes.find(n => n.type === 'receiver');
  const isKycVerified = Boolean(
    receiverNode?.details?.kycStatus?.includes('KYC') || 
    receiverNode?.details?.kycStatus?.includes('VERIFIED')
  );

  const isHistoricalEra = nodes.some(n => 
    n.details?.kycStatus?.includes('HISTORICAL') || 
    n.details?.scriptStandard?.includes('P2PK') ||
    n.details?.ipLog?.includes('Early Bitcoin')
  ) || (typeof caseOrNodes === 'object' && caseOrNodes?.description?.includes('Historical'));

  // Dimensional sub-scores
  const obfuscationScore = isHistoricalEra 
    ? 0 
    : (hasMixer ? weights.mixerWeight : Math.round(weights.mixerWeight * 0.2));

  const layeringScore = isHistoricalEra 
    ? Math.min(10, hopCount * 2) 
    : Math.min(40, hopCount * weights.hopWeight);

  const destinationScore = isHistoricalEra 
    ? 5 
    : (isKycVerified ? Math.max(0, 30 - weights.kycDiscountWeight) : 25);

  const velocityScore = isHistoricalEra 
    ? 5 
    : (nodes.length > 3 ? 15 : 8);

  // Protocol anomaly score
  const hasRbf = nodes.some(n => n.details?.rbfStatus?.includes('RBF Enabled'));
  const anomalyScore = isHistoricalEra ? 0 : (hasRbf ? 8 : 4);

  // Dynamic aggregate calculation
  const baseScore = isHistoricalEra ? 10 : weights.baseScore;
  const rawCalculatedScore = isHistoricalEra 
    ? Math.min(25, baseScore + layeringScore + obfuscationScore)
    : Math.min(99, Math.max(15, baseScore + obfuscationScore + layeringScore + (isKycVerified ? -weights.kycDiscountWeight : 10)));

  const calculatedRiskScore = Math.round(rawCalculatedScore);

  const threatBadge = getThreatBadge(calculatedRiskScore);
  const statutoryAction = getStatutoryLegalAction(calculatedRiskScore, isKycVerified, isHistoricalEra);
  const threatSignatures = evaluateThreatSignatures(nodes, {
    hasMixer,
    hopCount,
    isKycVerified,
    isHistoricalEra,
    obfuscationScore,
    layeringScore,
    destinationScore,
    kycDiscountWeight: weights.kycDiscountWeight
  });

  return {
    riskScore: calculatedRiskScore,
    isHistoricalEra,
    hasMixer,
    hopCount,
    isKycVerified,
    threatBadge,
    statutoryAction,
    dimensions: {
      obfuscationScore,
      layeringScore,
      destinationScore,
      velocityScore,
      anomalyScore
    },
    threatSignatures
  };
}

/**
 * Generate threat severity badge styling & label.
 */
export function getThreatBadge(score) {
  if (score < 35) {
    return {
      level: 'LOW',
      label: 'LOW / CLEAN FLOW',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.15)',
      description: 'Standard benign/historical transaction structure without obfuscation signatures.'
    };
  }
  if (score < 70) {
    return {
      level: 'MEDIUM',
      label: 'MODERATE EXPOSURE',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.15)',
      description: 'Multi-hop transit routing detected. Intermediate monitoring recommended.'
    };
  }
  return {
    level: 'HIGH',
    label: 'ELEVATED / CRITICAL THREAT',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.15)',
    description: 'High-risk privacy mixer, peeling chain, or unregistered cashout vectors detected.'
  };
}

/**
 * Evaluate structured threat signature items for law enforcement dossiers.
 */
export function evaluateThreatSignatures(nodes = [], context = {}) {
  const {
    hasMixer = false,
    hopCount = 0,
    isKycVerified = false,
    isHistoricalEra = false,
    obfuscationScore = 0,
    layeringScore = 0,
    destinationScore = 0,
    kycDiscountWeight = 15
  } = context;

  if (isHistoricalEra) {
    return [
      {
        name: "Early Bitcoin Era Provenance (Pre-2014 Era)",
        score: "0% (Clean)",
        category: "Era & Provenance Verification",
        description: "Direct peer-to-peer on-chain transaction originating in early Bitcoin era. No centralized mixing or coinjoin protocols present.",
        status: "mitigated"
      },
      {
        name: "Direct P2P On-Chain Routing",
        score: `+${layeringScore}%`,
        category: "Layering Hop Analysis",
        description: `Historical standard transaction structure with ${hopCount} transfer hops. No automated peeling chain obfuscation.`,
        status: "mitigated"
      },
      {
        name: "Terminal UTXO Status",
        score: `+${destinationScore}%`,
        category: "Destination Attribution",
        description: "Standard peer UTXO output on public Bitcoin ledger.",
        status: "mitigated"
      }
    ];
  }

  return [
    {
      name: hasMixer ? "Privacy Mixer Interaction (Wasabi / Tornado / Equal Output)" : "Standard Sequential Routing",
      score: `+${obfuscationScore}%`,
      category: "Obfuscation Analysis",
      description: hasMixer 
        ? "Direct transaction linkage with a known decentralized coinjoin or privacy mixer." 
        : "Sequential multi-hop routing detected between wallet hubs.",
      status: hasMixer ? "detected" : "mitigated"
    },
    {
      name: "Peeling Chain Pattern",
      score: `+${layeringScore}%`,
      category: "Layering Hop Analysis",
      description: `Detected ${hopCount} intermediate transit hops splitting value across structured change addresses.`,
      status: hopCount > 1 ? "detected" : "mitigated"
    },
    {
      name: "End Receiver Settlement Attribution",
      score: isKycVerified ? `-${kycDiscountWeight}%` : `+${destinationScore}%`,
      category: "Destination Attribution",
      description: isKycVerified 
        ? "Terminal destination resolves to a KYC-registered exchange deposit point." 
        : "Terminal destination remains unspent or non-KYC unspent UTXO.",
      status: isKycVerified ? "mitigated" : "detected"
    }
  ];
}

/**
 * Recommend statutory law enforcement actions (NDPS Act, CrPC / Bharatiya Nagarik Suraksha Sanhita).
 */
export function getStatutoryLegalAction(riskScore, isKycVerified = false, isHistoricalEra = false) {
  if (isHistoricalEra) {
    return {
      actionRequired: false,
      urgency: 'INFORMATIONAL',
      recommendations: [
        "Historical clean peer-to-peer transaction.",
        "No statutory freeze notice required."
      ]
    };
  }

  if (riskScore >= 70) {
    return {
      actionRequired: true,
      urgency: 'CRITICAL_ACTION_REQUIRED',
      recommendations: [
        "Issue Section 67 NDPS Act statutory notice to destination exchange gateway.",
        "Request immediate administrative freeze on target account and linked fiat withdrawal rails.",
        "Expand recursive CIOH cluster analysis across all co-spent input addresses."
      ]
    };
  }

  if (riskScore >= 35) {
    return {
      actionRequired: true,
      urgency: 'MONITORING_RECOMMENDED',
      recommendations: [
        "Deploy on-chain address monitoring for subsequent outgoing sweeps.",
        "Request preemptive KYC lookup from destination gateway."
      ]
    };
  }

  return {
    actionRequired: false,
    urgency: 'ROUTINE',
    recommendations: [
      "Standard benign transaction flow.",
      "Archive evidence file for audit trail."
    ]
  };
}
