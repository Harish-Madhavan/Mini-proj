import { JUDICIAL_GROUND_TRUTH } from '../data/judicialCorpus';

const VALID_ROLES = new Set(['payment', 'change']);

function isValidTxid(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

/**
 * Validate that a case has enough provenance and exact labels to be a
 * benchmark record. Candidate records intentionally fail this check.
 */
export function validateGroundTruthCase(caseEntry) {
  const errors = [];
  if (!caseEntry || caseEntry.status !== 'VERIFIED') {
    errors.push('Case status must be VERIFIED.');
  }
  if (!caseEntry?.review?.reviewer || !caseEntry.review.reviewedAt || !caseEntry.review.method) {
    errors.push('Reviewer, review date, and verification method are required.');
  }
  if (!Array.isArray(caseEntry?.sources) || caseEntry.sources.length === 0) {
    errors.push('At least one cited source is required.');
  } else if (caseEntry.sources.some(source =>
    !source || !source.id || !source.title || !source.url || !source.locator || source.primary !== true
  )) {
    errors.push('Each source must have an ID and be primary with a title, URL, and page/paragraph locator.');
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
  return null;
}

/**
 * Compare traced output links to a reviewed case. Metrics cover only the
 * transaction IDs included in that case and do not establish attribution.
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
    if (!txids.has(txid) || sourceId !== `tx_${link.txid}` ||
        !Number.isInteger(link.outputIndex) || !node?.details?.address) continue;
    predictions.set(`${txid}:${link.outputIndex}`, { node });
  }

  const matched = [];
  for (const [key, output] of expected) {
    const prediction = predictions.get(key);
    if (!prediction) continue;
    const node = prediction.node;
    if (!node || (output.address && node.details?.address?.toLowerCase() !== output.address.toLowerCase())) continue;
    matched.push({
      key,
      expectedRole: output.expectedRole,
      actualRole: traceRole(node),
    });
  }

  const truePositives = matched.length;
  const precision = predictions.size === 0 ? 0 : truePositives / predictions.size;
  const recall = expected.size === 0 ? 0 : truePositives / expected.size;
  const classified = matched.filter(row => row.actualRole !== null);
  const classificationAccuracy = classified.length === 0
    ? null
    : classified.filter(row => row.actualRole === row.expectedRole).length / classified.length;

  return {
    caseId: caseEntry.id,
    matchedOutputs: truePositives,
    expectedOutputs: expected.size,
    predictedOutputs: predictions.size,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    classifiedOutputs: classified.length,
    correctlyClassifiedOutputs: classified.filter(row => row.actualRole === row.expectedRole).length,
    classificationAccuracy,
    limitations: 'Measures exact transaction/output coverage and labeled payment/change agreement only; it does not validate ownership beyond the cited case labels or generalize to unseen cases.',
  };
}

/**
 * Aggregate reviewed cases only. An empty benchmark is an explicit status,
 * never a success-shaped 100% score.
 */
export function evaluateGroundTruthBenchmark(
  cases = JUDICIAL_GROUND_TRUTH,
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
  }), {
    matchedOutputs: 0,
    expectedOutputs: 0,
    predictedOutputs: 0,
    classifiedOutputs: 0,
    correctlyClassifiedOutputs: 0,
  });
  const precision = totals.predictedOutputs === 0 ? 0 : totals.matchedOutputs / totals.predictedOutputs;
  const recall = totals.expectedOutputs === 0 ? 0 : totals.matchedOutputs / totals.expectedOutputs;

  return {
    status: 'EVALUATED',
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
    },
    limitations: 'Results measure only reviewed labels represented in this benchmark; they do not prove source authenticity, legal admissibility, or performance on unseen cases.',
  };
}
