import { buildEvidenceGapChecklist } from '../evidence/evidenceReview';

const endpointTypes = new Set(['receiver', 'exchange', 'service', 'custodian']);

export function summarizeCaseForComparison(caseData) {
  const nodes = Array.isArray(caseData?.nodes) ? caseData.nodes : [];
  const links = Array.isArray(caseData?.links) ? caseData.links : [];
  const endpoints = nodes.filter(node =>
    endpointTypes.has(String(node.type || '').toLowerCase()) ||
    (links.some(link => (typeof link.target === 'object' ? link.target.id : link.target) === node.id) &&
      !links.some(link => (typeof link.source === 'object' ? link.source.id : link.source) === node.id))
  );
  const recoveryActions = (Array.isArray(caseData?.recoveryLeads) ? caseData.recoveryLeads : [])
    .flatMap(lead => Array.isArray(lead.actions) ? lead.actions : []);
  const gaps = buildEvidenceGapChecklist(caseData);
  const referenceCount = links.filter(link => link.txid || link.transactionId || link.details?.txid).length;
  const confidence = Number(caseData?.traceMeta?.confidence);

  return {
    id: caseData?.id || '',
    title: caseData?.title || 'Untitled case',
    traceType: caseData?.traceType || 'Not recorded',
    riskScore: caseData?.riskScore != null && Number.isFinite(Number(caseData.riskScore)) ? Number(caseData.riskScore) : null,
    traceConfidence: caseData?.traceMeta?.confidence != null && Number.isFinite(confidence) ? confidence : null,
    nodeCount: nodes.length,
    flowCount: links.length,
    endpointCount: endpoints.length,
    endpoints: endpoints.map(node => node.details?.address || node.label || node.id),
    transactionReferenceCount: referenceCount,
    transactionReferenceCoverage: links.length ? referenceCount / links.length : 0,
    evidenceGapCount: gaps.length,
    highPriorityGapCount: gaps.filter(gap => gap.priority === 'high').length,
    recoveryActionCount: recoveryActions.length,
    openRecoveryActionCount: recoveryActions.filter(action =>
      !['completed', 'unable_to_proceed', 'recovery_confirmed'].includes(action.state)
    ).length
  };
}

export function compareCases(cases = []) {
  return (Array.isArray(cases) ? cases : []).map(summarizeCaseForComparison);
}
