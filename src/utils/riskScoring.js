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
/**
 * Clamp caller-supplied weight overrides into a sane numeric range so a
 * negative or NaN weight can never invert the risk model.
 */
function sanitizeWeights(customWeights = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(customWeights)) {
    if (key in DEFAULT_RISK_WEIGHTS && Number.isFinite(value)) {
      clean[key] = Math.min(100, Math.max(0, value));
    }
  }
  return { ...DEFAULT_RISK_WEIGHTS, ...clean };
}

function isIdentityVerified(node) {
  const status = node?.details?.kycStatus || '';
  return status.includes('IDENTITY') || status.includes('VERIFIED');
}

export function calculateForensicRiskScore(caseOrNodes, customWeights = {}) {
  const nodes = Array.isArray(caseOrNodes) ? caseOrNodes : (caseOrNodes?.nodes || []);
  const weights = sanitizeWeights(customWeights);

  const hasMixer = nodes.some(n => n.type === 'mixer');
  const hopCount = nodes.filter(n => n.type === 'hop').length;
  const receiverNodes = nodes.filter(n => n.type === 'receiver');
  // A case is only as clean as its dirtiest endpoint: KYC applies only when
  // every terminal receiver is attributed, not just the first one found.
  const isKycVerified = receiverNodes.length > 0 && receiverNodes.every(isIdentityVerified);

  const isHistoricalEra = nodes.some(n =>
    n.details?.kycStatus?.includes('HISTORICAL') ||
    n.details?.scriptStandard?.includes('P2PK') ||
    n.details?.ipLog?.includes('Early Bitcoin')
  ) || (typeof caseOrNodes === 'object' && caseOrNodes?.description?.includes('Historical'));

  // Dimensional sub-scores (all five feed the aggregate below)
  const obfuscationScore = isHistoricalEra
    ? 0
    : (hasMixer ? weights.mixerWeight : 0);

  const layeringScore = isHistoricalEra
    ? Math.min(10, hopCount * 2)
    : Math.min(40, hopCount * weights.hopWeight);

  const destinationScore = isHistoricalEra
    ? 5
    : (isKycVerified ? 0 : 18);

  const velocityScore = isHistoricalEra
    ? 5
    : (nodes.length > 4 ? 6 : nodes.length > 2 ? 3 : 0);

  // Protocol anomaly score
  const hasRbf = nodes.some(n => n.details?.rbfStatus?.includes('Replaceable fee'));
  const anomalyScore = isHistoricalEra ? 0 : (hasRbf ? 6 : 0);

  // Aggregate across every dimension so no sub-score is silently discarded.
  const baseScore = isHistoricalEra ? 10 : weights.baseScore;
  const rawCalculatedScore = isHistoricalEra
    ? Math.min(25, baseScore + layeringScore + obfuscationScore)
    : baseScore + obfuscationScore + layeringScore + destinationScore + velocityScore + anomalyScore - (isKycVerified ? weights.kycDiscountWeight : 0);

  const calculatedRiskScore = Math.round(Math.min(99, Math.max(5, rawCalculatedScore)));

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
      label: 'Low',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.15)',
      description: 'Standard transaction structure without obfuscation signatures.'
    };
  }
  if (score < 70) {
    return {
      level: 'MEDIUM',
      label: 'Medium',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.15)',
      description: 'Multi-hop routing. Monitoring recommended.'
    };
  }
  return {
    level: 'HIGH',
    label: 'High',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.15)',
    description: 'Mixer, peeling chain, or unregistered cash-out pattern detected.'
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
        name: "Early Bitcoin era (pre-2014)",
        score: "0% (Clean)",
        category: "Era check",
        description: "Direct transfer from the early Bitcoin era. No mixing involved.",
        status: "mitigated"
      },
      {
        name: "Direct on-chain routing",
        score: `+${layeringScore}%`,
        category: "Split analysis",
        description: `Plain historical structure with ${hopCount} transfer steps. No automated splitting.`,
        status: "mitigated"
      },
      {
        name: "Final output status",
        score: `+${destinationScore}%`,
        category: "Destination check",
        description: "Standard peer output on the public Bitcoin ledger.",
        status: "mitigated"
      }
    ];
  }

  return [
    {
      name: hasMixer ? "Mixer interaction" : "Standard routing",
      score: `+${obfuscationScore}%`,
      category: "Mixing check",
      description: hasMixer
        ? "Money passed through a known mixer."
        : "Step-by-step routing between wallets.",
      status: hasMixer ? "detected" : "mitigated"
    },
    {
      name: "Split pattern",
      score: `+${layeringScore}%`,
      category: "Split analysis",
      description: `${hopCount} middle steps splitting value across change addresses.`,
      status: hopCount > 1 ? "detected" : "mitigated"
    },
    {
      name: "End receiver check",
      score: isKycVerified ? `-${kycDiscountWeight}%` : `+${destinationScore}%`,
      category: "Destination check",
      description: isKycVerified
        ? "End point is an identity-checked exchange."
        : "End point is an output with no identity records.",
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
        "Request immediate administrative freeze on target account and linked cash withdrawal rails.",
        "Expand shared-spending cluster analysis across all co-spent input addresses."
      ]
    };
  }

  if (riskScore >= 35) {
    return {
      actionRequired: true,
      urgency: 'MONITORING_RECOMMENDED',
      recommendations: [
        "Deploy on-chain address monitoring for subsequent outgoing sweeps.",
        "Request identity records from the destination exchange."
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
