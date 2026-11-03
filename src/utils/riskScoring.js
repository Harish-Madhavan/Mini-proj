/**
 * AegisTrace Unified Multi-Dimensional Forensic Risk Scoring Engine (SIH1675 Core)
 *
 * Computes risk across 5 forensic dimensions:
 * 1. Obfuscation & Privacy Mixer Intermediation (Wasabi / Whirlpool / Tornado / Equal-value CoinJoin)
 * 2. Layering Hop Depth & Peeling Index (Intermediate change transit hubs)
 * 3. Settlement & Counterparty Attribution (explicit identity evidence vs unknown owner)
 * 4. Protocol & Transaction Anomalies (RBF signaling, zero/extreme fee rates, non-standard scripts)
 * 5. Blockchain Era & Provenance Modulation (Genesis / Early Satoshi era discount for clean P2P)
 */

import { identifyBridgeEntity, parseCrossChainMemo } from './crossChainForensics';
import { scanCaseSweeps } from './obfuscationForensics';
import { tagKnownEntity } from './knownEntities';
import { RISK_SIGNAL_SCORES } from '../constants/config';

export const DEFAULT_RISK_WEIGHTS = {
  mixerWeight: 35,
  hopWeight: 12,
  kycDiscountWeight: 15,
  baseScore: 20
};

// Re-exported from constants/config.js (single source) so tests and the
// dossier read the same numbers the aggregate uses.
export const {
  CONSOLIDATION_IMMINENT: CONSOLIDATION_IMMINENT_SCORE,
  CONSOLIDATION_WATCH: CONSOLIDATION_WATCH_SCORE,
  SANCTIONED_ENTITY: SANCTIONED_ENTITY_SCORE,
  DARKNET_ENTITY: DARKNET_ENTITY_SCORE,
} = RISK_SIGNAL_SCORES;

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

export function calculateForensicRiskScore(caseOrNodes, customWeights = {}) {
  const nodes = Array.isArray(caseOrNodes) ? caseOrNodes : (caseOrNodes?.nodes || []);
  // Sweep detection needs graph links; node-only callers (unit fixtures)
  // simply score no consolidation signal instead of crashing.
  const links = Array.isArray(caseOrNodes) ? [] : (caseOrNodes?.links || []);
  const isSimulated = !Array.isArray(caseOrNodes) &&
    ['SIMULATED_ESTIMATE', 'MANUAL_HYPOTHESIS'].includes(caseOrNodes?.traceType);
  const weights = sanitizeWeights(customWeights);

  const hasMixer = nodes.some(n => n.type === 'mixer');
  const hasBridge = nodes.some(n => 
    n.type === 'bridge' || 
    Boolean(n.details?.crossChain) || 
    Boolean(identifyBridgeEntity(n)) ||
    Boolean(n.details?.opReturnDecoded && parseCrossChainMemo(n.details.opReturnDecoded))
  );
  const hopCount = nodes.filter(n => n.type === 'hop').length;
  // No trusted identity-verification source is configured. A caller-provided
  // attribution record is a lead, not a verified fact or a risk discount.
  const isKycVerified = false;

  const isHistoricalEra = nodes.some(n =>
    n.details?.kycStatus?.includes('HISTORICAL') ||
    n.details?.scriptStandard?.includes('P2PK') ||
    n.details?.ipLog?.includes('Early Bitcoin')
  ) || (typeof caseOrNodes === 'object' && caseOrNodes?.description?.includes('Historical'));

  // Dimensional sub-scores (all five feed the aggregate below)
  const obfuscationScore = isHistoricalEra
    ? 0
    : (hasMixer ? weights.mixerWeight : (hasBridge ? Math.round(weights.mixerWeight * 0.8) : 0));

  const layeringScore = isHistoricalEra
    ? Math.min(10, hopCount * 2)
    : Math.min(40, hopCount * weights.hopWeight);

  const destinationScore = isHistoricalEra ? 5 : 0;

  const velocityScore = isHistoricalEra
    ? 5
    : (nodes.length > 4 ? 6 : nodes.length > 2 ? 3 : 0);

  // Protocol anomaly score
  const hasRbf = nodes.some(n => n.details?.rbfStatus?.includes('Replaceable fee'));
  const anomalyScore = isHistoricalEra ? 0 : (hasRbf ? 6 : 0);

  // Consolidation-sweep signal: a fan-in hub (4+ inputs collapsing into one
  // or one dominant output) is cash-out preparation. Never throws: a
  // malformed graph degrades to no-signal rather than breaking scoring.
  let sweepScan = { detected: false, sweeps: [], confidence: 0 };
  if (!isHistoricalEra && links.length > 0) {
    try {
      sweepScan = scanCaseSweeps(nodes, links);
    } catch {
      sweepScan = { detected: false, sweeps: [], confidence: 0 };
    }
  }
  const sweepImminent = sweepScan.detected && sweepScan.sweeps.some(s => s.cashoutUrgency === 'IMMINENT');
  const consolidationScore = isHistoricalEra || !sweepScan.detected
    ? 0
    : (sweepImminent ? CONSOLIDATION_IMMINENT_SCORE : CONSOLIDATION_WATCH_SCORE);

  // Attribution signal: any case address matching a curated sanctioned or
  // darknet entity tag (OFAC SDN, seized darknet clusters). Historical-era
  // transfers predate every listed designation, so they score nothing.
  const entityHits = isHistoricalEra ? [] : collectEntityHits(nodes);
  const hasSanctionedHit = entityHits.some(h => h.category === 'sanctioned');
  const hasDarknetHit = entityHits.some(h => h.category === 'darknet');
  const attributionScore = hasSanctionedHit
    ? SANCTIONED_ENTITY_SCORE
    : (hasDarknetHit ? DARKNET_ENTITY_SCORE : 0);

  // Aggregate across every dimension so no sub-score is silently discarded.
  const baseScore = isHistoricalEra ? 10 : weights.baseScore;
  const rawCalculatedScore = isHistoricalEra
    ? Math.min(25, baseScore + layeringScore + obfuscationScore)
    : baseScore + obfuscationScore + layeringScore + destinationScore + velocityScore + anomalyScore + consolidationScore + attributionScore - (isKycVerified ? weights.kycDiscountWeight : 0);

  const hasRiskSignal = !isSimulated && (
    isHistoricalEra || hasMixer || hasBridge || hopCount > 0 ||
    anomalyScore > 0 || consolidationScore > 0 || attributionScore > 0
  );
  const calculatedRiskScore = hasRiskSignal
    ? Math.round(Math.min(99, Math.max(5, rawCalculatedScore)))
    : null;

  const threatBadge = getThreatBadge(calculatedRiskScore);
  const statutoryAction = getStatutoryLegalAction(calculatedRiskScore, isKycVerified, isHistoricalEra, {
    sweepImminent,
    hasSanctionedHit,
  });
  const threatSignatures = evaluateThreatSignatures(nodes, {
    hasMixer,
    hasBridge,
    hopCount,
    isKycVerified,
    isHistoricalEra,
    obfuscationScore,
    layeringScore,
    destinationScore,
    kycDiscountWeight: weights.kycDiscountWeight,
    consolidationScore,
    sweepImminent,
    sweepCount: sweepScan.sweeps.length,
    attributionScore,
    entityHits,
  });

  return {
    riskScore: calculatedRiskScore,
    assessmentStatus: isSimulated
      ? caseOrNodes.traceType === 'SIMULATED_ESTIMATE' ? 'SIMULATED' : 'USER_SUPPLIED'
      : hasRiskSignal ? 'ASSESSED' : 'INSUFFICIENT_EVIDENCE',
    isHistoricalEra,
    hasMixer,
    hasBridge,
    hopCount,
    isKycVerified,
    hasSweep: sweepScan.detected,
    sweepImminent,
    entityHits,
    threatBadge,
    statutoryAction,
    dimensions: {
      obfuscationScore,
      layeringScore,
      destinationScore,
      velocityScore,
      anomalyScore,
      consolidationScore,
      attributionScore
    },
    threatSignatures
  };
}

/**
 * Collect curated-entity attributions for every address-bearing node.
 * Pure scan over node identifiers — never throws, never fetches.
 */
export function collectEntityHits(nodes = []) {
  const hits = [];
  for (const n of nodes || []) {
    const candidates = [
      n.details?.address,
      n.entityName,
      typeof n.id === 'string' ? n.id.replace(/^(in_|out_|tx_|op_)/, '') : null,
    ].filter(v => typeof v === 'string' && v.length > 0);
    for (const c of candidates) {
      let tag = null;
      try {
        tag = tagKnownEntity(c);
      } catch {
        tag = null;
      }
      if (tag && (tag.category === 'sanctioned' || tag.category === 'darknet')) {
        hits.push({ nodeId: n.id, address: c, label: tag.label, category: tag.category, risk: tag.risk });
        break;
      }
    }
  }
  return hits;
}

/**
 * Generate threat severity badge styling & label.
 */
export function getThreatBadge(score) {
  if (!Number.isFinite(score)) {
    return {
      level: 'UNASSESSED',
      label: 'Insufficient evidence',
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.15)',
      description: 'No risk score is assigned because the available case has no qualifying risk signal.'
    };
  }
  if (score < 35) {
    return {
      level: 'LOW',
      label: 'Low',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.15)',
      description: 'No elevated signal was identified in the assessed data; this does not establish benign activity.'
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
    hasBridge = false,
    hopCount = 0,
    isKycVerified = false,
    isHistoricalEra = false,
    obfuscationScore = 0,
    layeringScore = 0,
    destinationScore = 0,
    kycDiscountWeight = 15,
    consolidationScore = 0,
    sweepImminent = false,
    sweepCount = 0,
    attributionScore = 0,
    entityHits = []
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

  const signatures = [
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
        ? "An identity-attribution evidence record is attached to the endpoint."
        : "Endpoint ownership is not established by the on-chain trace.",
      status: isKycVerified ? "mitigated" : "detected"
    }
  ];

  if (hasBridge) {
    signatures.push({
      name: "Cross-chain bridge exit",
      score: "+28%",
      category: "Chain-hopping check",
      description: "Funds transferred to non-custodial liquidity vault for secondary blockchain settlement.",
      status: "detected"
    });
  }

  if (consolidationScore > 0) {
    signatures.push({
      name: sweepImminent ? "Consolidation sweep (custodial cash-out)" : "Consolidation sweep (watch)",
      score: `+${consolidationScore}%`,
      category: "Sweep check",
      description: sweepImminent
        ? `${sweepCount} fan-in hub(s) collapsing into custodial-held output — imminent cash-out preparation.`
        : `${sweepCount} fan-in hub(s) gathering dispersed funds — watch the destination for the next move.`,
      status: "detected"
    });
  }

  if (attributionScore > 0 && entityHits.length > 0) {
    const top = entityHits[0];
    signatures.push({
      name: top.category === 'sanctioned' ? "Sanctioned entity contact" : "Darknet entity contact",
      score: `+${attributionScore}%`,
      category: "Attribution check",
      description: `${entityHits.length} address(es) match curated ${top.category} tag "${top.label}" (e.g. ${top.address?.slice(0, 18)}…). Confirm with Section 67 notice before funds move.`,
      status: "detected"
    });
  }

  return signatures;
}

/**
 * Recommend statutory law enforcement actions (NDPS Act, CrPC / Bharatiya Nagarik Suraksha Sanhita).
 */
export function getStatutoryLegalAction(riskScore, isKycVerified = false, isHistoricalEra = false, signals = {}) {
  const { sweepImminent = false, hasSanctionedHit = false } = signals || {};
  if (!Number.isFinite(riskScore) && !isHistoricalEra) {
    return {
      actionRequired: false,
      urgency: 'NOT_ASSESSED',
      recommendations: [
        'Insufficient evidence for a risk-based action recommendation.',
        'Obtain and independently verify transaction and attribution evidence before escalation.'
      ]
    };
  }
  if (isHistoricalEra) {
    return {
      actionRequired: false,
      urgency: 'INFORMATIONAL',
      recommendations: [
        "Historical-era chain data identified; historical timing alone does not establish purpose or ownership.",
        "Review transaction provenance and case context before drawing conclusions."
      ]
    };
  }

  if (riskScore >= 70) {
    const recommendations = [
      "Priority analyst review: independently verify the trace, source data, and all material risk signals.",
      "Do not infer ownership or wrongdoing from transaction patterns; seek independent attribution evidence.",
      "If justified by independently verified evidence, consult counsel on applicable lawful process."
    ];
    if (sweepImminent) {
      recommendations.push("Review the recent consolidation promptly; the destination is not established as a custodian or exchange.");
    }
    if (hasSanctionedHit) {
      recommendations.push("Review the exact identifier and sanctions source independently before considering a referral.");
    }
    return {
      actionRequired: false,
      urgency: 'PRIORITY_ANALYST_REVIEW',
      recommendations
    };
  }

  if (riskScore >= 35) {
    const recommendations = [
      "Analyst review is recommended; independently validate the observed transactions and the scope of the trace.",
      "If service attribution is established from independent evidence, consult counsel on appropriate lawful process."
    ];
    if (sweepImminent) {
      recommendations.push("Review the consolidation pattern; it does not by itself establish a cash-out or service.");
    }
    return {
      actionRequired: false,
      urgency: 'ANALYST_REVIEW',
      recommendations
    };
  }

  return {
    actionRequired: false,
    urgency: 'ROUTINE',
    recommendations: [
    "No elevated heuristic signal was identified; this is not a finding of benign activity.",
    "Preserve the reviewed source data and record any limitations."
    ]
  };
}
