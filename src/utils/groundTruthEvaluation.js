import { TRACE_BENCHMARK_CASES } from '../data/judicialCorpus';
import { parseSats } from './taintAnalysis';

const VALID_ROLES = new Set(['payment', 'change']);
const VALID_NODE_ROLES = new Set(['payee', 'change', 'intermediate', 'end_receiver']);
const ALLOWED_SOURCE_TYPES = new Set([
  'primary_record',
  'primary_chain_data',
  'secondary_explorer',
  'secondary_historical_reference',
]);

function isValidTxid(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

/**
 * Validate that a case has enough provenance and exact labels to be a
 * benchmark record. Candidate records intentionally fail this check.
 */
export function validateGroundTruthCase(caseEntry) {
  const errors = [];
  if (!caseEntry || !['VERIFIED', 'SOURCE_CORROBORATED'].includes(caseEntry.status)) {
    errors.push('Case status must be VERIFIED or SOURCE_CORROBORATED.');
  }
  if (!caseEntry?.review?.reviewer || !caseEntry.review.reviewedAt || !caseEntry.review.method) {
    errors.push('Reviewer, review date, and verification method are required.');
  }
  if (!Array.isArray(caseEntry?.sources) || caseEntry.sources.length === 0) {
    errors.push('At least one cited source is required.');
  } else if (caseEntry.sources.some(source =>
    !source || !source.id || !source.title || !source.url || !source.locator ||
    !ALLOWED_SOURCE_TYPES.has(source.type) || !source.labelBasis
  )) {
    errors.push('Each source must have an ID, supported type, title, URL, locator, and label basis.');
  }
  const sourceIds = new Set((caseEntry?.sources || []).filter(Boolean).map(source => source.id));
  const chainEvidenceTxids = new Set((caseEntry?.chainEvidence || [])
    .filter(evidence => evidence && evidence.txid && evidence.provider && evidence.retrievedAt &&
      /^SHA256:[0-9A-F]{64}$/.test(evidence.canonicalResponseSha256 || ''))
    .map(evidence => evidence.txid.toLowerCase()));
  if (!Array.isArray(caseEntry?.chainEvidence) || caseEntry.chainEvidence.length === 0) {
    errors.push('A canonical on-chain response digest and provider record are required.');
  }
  if (!Array.isArray(caseEntry?.expectedOutputs) || caseEntry.expectedOutputs.length === 0) {
    errors.push('At least one exact expected output label is required.');
  } else {
    caseEntry.expectedOutputs.forEach((output, index) => {
      if (!output || typeof output !== 'object') {
        errors.push(`Expected output ${index} must be an object.`);
        return;
      }
      if (!isValidTxid(output.txid)) errors.push(`Expected output ${index} has an invalid transaction ID.`);
      if (!Number.isInteger(output.outputIndex) || output.outputIndex < 0) {
        errors.push(`Expected output ${index} has an invalid output index.`);
      }
      if (typeof output.address !== 'string' || !output.address) {
        errors.push(`Expected output ${index} is missing a valid address.`);
      }
      if (!VALID_ROLES.has(output.expectedRole)) {
        errors.push(`Expected output ${index} must have a payment or change role.`);
      }
      if (!VALID_NODE_ROLES.has(output.expectedNodeRole)) {
        errors.push(`Expected output ${index} must have a reviewed payee, change, intermediate, or end_receiver node role.`);
      }
      if (!Array.isArray(output.sourceIds) || output.sourceIds.length === 0 ||
          output.sourceIds.some(sourceId => !sourceIds.has(sourceId))) {
        errors.push(`Expected output ${index} must cite the source(s) supporting its label.`);
      }
      if (isValidTxid(output.txid) && !chainEvidenceTxids.has(output.txid.toLowerCase())) {
        errors.push(`Expected output ${index} has no matching on-chain response provenance.`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

function traceRole(node) {
  if (node?.type === 'change' || node?.details?.isChange === true) return 'change';
  if (node?.type === 'receiver' || node?.details?.isPayment === true) return 'payment';
  if (typeof node?.details?.heuristicScore === 'number') {
    if (node.details.heuristicScore < -1) return 'change';
    if (node.details.heuristicScore > 1) return 'payment';
  }
  return null;
}

function tracePathRole(node, nodeId, links) {
  if (node?.details?.outspendSpent === false) return 'end_receiver';
  const isFollowed = links.some(link => {
    const source = typeof link.source === 'object' ? link.source.id : link.source;
    const target = typeof link.target === 'object' ? link.target.id : link.target;
    return source === nodeId &&
      typeof target === 'string' &&
      target.startsWith('tx_') &&
      typeof link.previousTxid === 'string' &&
      Number.isInteger(link.outputIndex) &&
      link.inputOutpoint === `${link.previousTxid}:${link.outputIndex}`;
  });
  if (isFollowed) return 'intermediate';
  if (node?.details?.outspendSpent === true) return 'trace_boundary';
  return 'unknown';
}

function nodeRoleMatches(expectedNodeRole, classificationRole, pathRole) {
  if (expectedNodeRole === 'payee') return classificationRole === 'payment';
  if (expectedNodeRole === 'change') return classificationRole === 'change';
  return pathRole === expectedNodeRole;
}

function predictedNodeRoles(classificationRole, pathRole) {
  const roles = [];
  if (classificationRole === 'payment') roles.push('payee_candidate');
  if (classificationRole === 'change') roles.push('change');
  if (pathRole === 'intermediate') roles.push('intermediate');
  if (pathRole === 'end_receiver') roles.push('end_receiver');
  if (pathRole === 'trace_boundary') roles.push('trace_boundary');
  return roles.length > 0 ? roles : ['unknown'];
}

/**
 * Compare traced outputs and node roles to a reviewed case. Payee agreement
 * means the output was classified as payment; it does not identify a person.
 */
export function evaluateTraceAgainstGroundTruth(trace, caseEntry) {
  const validation = validateGroundTruthCase(caseEntry);
  if (!validation.valid) {
    throw new Error(`Ground-truth case is not benchmark-ready: ${validation.errors.join(' ')}`);
  }

  const nodes = new Map((trace?.nodes || []).map(node => [node.id, node]));
  const expected = new Map(caseEntry.expectedOutputs.map(output => [
    `${output.txid.toLowerCase()}:${output.outputIndex}`,
    output,
  ]));
  const txids = new Set(caseEntry.expectedOutputs.map(output => output.txid.toLowerCase()));
  const predictions = new Map();
  for (const link of trace?.links || []) {
    const txid = String(link.txid || '').toLowerCase();
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    const node = nodes.get(targetId);
    const valueSats = parseSats(link.value);
    if (!txids.has(txid) || sourceId !== `tx_${link.txid}` ||
        !Number.isInteger(link.outputIndex) || valueSats <= 0 || !node?.details?.address) continue;
    predictions.set(`${txid}:${link.outputIndex}`, { node, nodeId: targetId, valueSats });
  }

  const matched = [];
  const roleResults = [];
  for (const [key, output] of expected) {
    const prediction = predictions.get(key);
    if (!prediction) {
      roleResults.push({
        key,
        expectedNodeRole: output.expectedNodeRole,
        predictedNodeRoles: ['unknown'],
        classificationRole: null,
        pathRole: 'unknown',
        matched: false,
        predictionAvailable: false,
      });
      continue;
    }
    const { node, nodeId } = prediction;
    const addressMatches = output.address &&
      node?.details?.address?.toLowerCase() === output.address.toLowerCase();
    const traceIdentifierMatches = output.traceIdentifier &&
      node?.details?.address === output.traceIdentifier;
    const valueMatches = output.valueSats == null || prediction.valueSats === output.valueSats;
    if (!node || (!addressMatches && !traceIdentifierMatches) || !valueMatches) {
      roleResults.push({
        key,
        expectedNodeRole: output.expectedNodeRole,
        predictedNodeRoles: ['unknown'],
        classificationRole: null,
        pathRole: 'unknown',
        matched: false,
        predictionAvailable: false,
      });
      continue;
    }
    const classificationRole = traceRole(node);
    const pathRole = tracePathRole(node, nodeId, trace?.links || []);
    const predictedRoles = predictedNodeRoles(classificationRole, pathRole);
    const roleMatch = nodeRoleMatches(output.expectedNodeRole, classificationRole, pathRole);
    matched.push({
      key,
      expectedRole: output.expectedRole,
      actualRole: classificationRole,
      expectedNodeRole: output.expectedNodeRole,
      predictedNodeRoles: predictedRoles,
      roleMatch,
    });
    roleResults.push({
      key,
      expectedNodeRole: output.expectedNodeRole,
      predictedNodeRoles: predictedRoles,
      classificationRole,
      pathRole,
      matched: roleMatch,
      predictionAvailable: ['payee', 'change'].includes(output.expectedNodeRole)
        ? classificationRole !== null
        : !['unknown', 'trace_boundary'].includes(pathRole),
    });
  }

  const truePositives = matched.length;
  const precision = predictions.size === 0 ? 0 : truePositives / predictions.size;
  const recall = expected.size === 0 ? 0 : truePositives / expected.size;
  const classified = matched.filter(row => row.actualRole !== null);
  const classificationAccuracy = classified.length === 0
    ? null
    : classified.filter(row => row.actualRole === row.expectedRole).length / classified.length;
  const nodeRoleAccuracy = roleResults.length === 0
    ? null
    : roleResults.filter(row => row.matched).length / roleResults.length;
  const nodeRoleCoverage = roleResults.length === 0
    ? 0
    : roleResults.filter(row => row.predictionAvailable).length / roleResults.length;

  return {
    caseId: caseEntry.id,
    evidenceStatus: caseEntry.status,
    matchedOutputs: truePositives,
    expectedOutputs: expected.size,
    predictedOutputs: predictions.size,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    classifiedOutputs: classified.length,
    correctlyClassifiedOutputs: classified.filter(row => row.actualRole === row.expectedRole).length,
    classificationAccuracy,
    nodeRoleCount: roleResults.length,
    matchedNodeRoleCount: roleResults.filter(row => row.matched).length,
    nodeRoleAccuracy,
    nodeRoleCoverage,
    nodeRoles: roleResults,
    limitations: 'Payee agreement measures payment-candidate classification, not identity or beneficial ownership. Intermediate/end-receiver agreement measures only observed spend links and UTXO status; a depth or fetch boundary is not an end receiver. Results cover cited labels only and do not generalize to unseen cases.',
  };
}

/**
 * Aggregate reviewed cases only. An empty benchmark is an explicit status,
 * never a success-shaped 100% score.
 */
export function evaluateGroundTruthBenchmark(
  cases = TRACE_BENCHMARK_CASES,
  tracesByCaseId = {}
) {
  if (!Array.isArray(cases)) throw new TypeError('Ground-truth benchmark cases must be an array.');
  if (cases.length === 0) {
    return { status: 'NO_VERIFIED_CASES', caseCount: 0, cases: [], aggregate: null };
  }

  const results = cases.map(caseEntry =>
    evaluateTraceAgainstGroundTruth(tracesByCaseId[caseEntry.id], caseEntry)
  );
  const totals = results.reduce((sum, result) => ({
    matchedOutputs: sum.matchedOutputs + result.matchedOutputs,
    expectedOutputs: sum.expectedOutputs + result.expectedOutputs,
    predictedOutputs: sum.predictedOutputs + result.predictedOutputs,
    classifiedOutputs: sum.classifiedOutputs + result.classifiedOutputs,
    correctlyClassifiedOutputs: sum.correctlyClassifiedOutputs + result.correctlyClassifiedOutputs,
    nodeRoleCount: sum.nodeRoleCount + result.nodeRoleCount,
    matchedNodeRoleCount: sum.matchedNodeRoleCount + result.matchedNodeRoleCount,
    availableNodeRolePredictions: sum.availableNodeRolePredictions +
      result.nodeRoles.filter(row => row.predictionAvailable).length,
  }), {
    matchedOutputs: 0,
    expectedOutputs: 0,
    predictedOutputs: 0,
    classifiedOutputs: 0,
    correctlyClassifiedOutputs: 0,
    nodeRoleCount: 0,
    matchedNodeRoleCount: 0,
    availableNodeRolePredictions: 0,
  });
  const precision = totals.predictedOutputs === 0 ? 0 : totals.matchedOutputs / totals.predictedOutputs;
  const recall = totals.expectedOutputs === 0 ? 0 : totals.matchedOutputs / totals.expectedOutputs;
  const status = cases.some(caseEntry => caseEntry.status === 'SOURCE_CORROBORATED')
    ? 'SOURCE_CORROBORATED'
    : 'EVALUATED';

  return {
    status,
    caseCount: results.length,
    cases: results,
    aggregate: {
      ...totals,
      precision,
      recall,
      f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
      classificationAccuracy: totals.classifiedOutputs === 0
        ? null
        : totals.correctlyClassifiedOutputs / totals.classifiedOutputs,
      nodeRoleAccuracy: totals.nodeRoleCount === 0
        ? null
        : totals.matchedNodeRoleCount / totals.nodeRoleCount,
      nodeRoleCoverage: totals.nodeRoleCount === 0
        ? 0
        : totals.availableNodeRolePredictions / totals.nodeRoleCount,
    },
    limitations: 'Results measure only cited labels represented in this benchmark; secondary-source labels are not independent legal findings and do not prove legal admissibility or performance on unseen cases.',
  };
}
