import { calculateEdgeTaintMap, calculateTaintMap, parseSats } from '../../utils/taintAnalysis';

const nodeId = value => typeof value === 'object' && value ? value.id : value;
const txReference = link => link.txid || link.transactionId || link.details?.txid || null;
const timeReference = link => link.blockTime ?? link.block_time ?? link.timestamp ?? null;
const hasTemporalEvidence = link => {
  const height = Number(link.blockHeight ?? link.block_height);
  if (Number.isFinite(height) && height > 0) return true;
  const raw = timeReference(link);
  if (typeof raw === 'number') return Number.isFinite(raw);
  return typeof raw === 'string' && !['on-chain', 'settled', 'embedded', 'unknown'].includes(raw.trim().toLowerCase()) && Number.isFinite(Date.parse(raw));
};

function sourceStrength(link, manifestEntry) {
  if (manifestEntry?.transactionResponse?.canonicalResponseSha256) {
    return 'Provider and canonical response digest recorded; independently verify the source and raw chain data';
  }
  if (txReference(link) && hasTemporalEvidence(link)) return 'Transaction reference and time/block metadata recorded';
  if (txReference(link)) return 'Transaction reference recorded; corroborating time/block metadata unavailable';
  return 'Graph edge only; underlying transaction reference unavailable';
}

/** Auto-derived records are labeled by evidence class and never promoted to identity facts. */
export function deriveEvidenceClaims(caseData) {
  if (!caseData) return [];
  const nodes = caseData.nodes || [];
  const generated = [];
  const sourceByTxid = new Map(
    (caseData.traceMeta?.collection?.sourceManifest || []).map(entry => [entry.txid, entry])
  );

  (caseData.links || []).forEach((link, index) => {
    const source = nodeId(link.source);
    const target = nodeId(link.target);
    const txid = txReference(link);
    const manifestEntry = txid ? sourceByTxid.get(txid) : null;
    const outpoint = link.inputOutpoint ||
      (link.previousTxid && Number.isInteger(link.outputIndex) ? `${link.previousTxid}:${link.outputIndex}` :
        (txid && Number.isInteger(link.outputIndex) ? `${txid}:${link.outputIndex}` : null));
    generated.push({
      id: `onchain:${txid || `edge-${index}`}:${source}:${target}`,
      origin: 'derived',
      evidenceClass: txid ? 'on_chain_reference' : 'graph_record',
      classification: txid ? 'Transaction reference' : 'Graph flow record',
      statement: `Stored graph edge records value flow from ${source} to ${target}: ${link.value || 'value unavailable'}.`,
      sourceReference: outpoint || txid || `Graph link ${index + 1}`,
      sourceStrength: sourceStrength(link, manifestEntry),
      observedAt: timeReference(link),
      transactionId: txid,
      outpoint,
      blockHeight: link.blockHeight ?? link.block_height ?? null,
      provider: manifestEntry?.transactionResponse?.provider || null,
      canonicalResponseSha256: manifestEntry?.transactionResponse?.canonicalResponseSha256 || null,
      status: 'recorded',
      attributionWarning: 'This records the graph edge; it does not independently validate the underlying transaction or inferred path.'
    });
  });

  nodes.forEach(node => {
    const address = node.details?.address || node.id;
    const attribution = node.details?.attributionEvidence || node.details?.identityEvidence;
    if (attribution?.source || attribution?.subject) {
      generated.push({
        id: `hypothesis:${node.id}`,
        origin: 'derived',
        evidenceClass: 'attribution_hypothesis',
        classification: 'Attribution hypothesis',
        statement: `A stored attribution record associates ${address} with ${attribution.subject || node.entityName || 'an unspecified subject'}.`,
        sourceReference: attribution.source || 'Source not recorded',
        sourceStrength: 'Investigator/application record; source contents have not been independently verified',
        confidence: Number.isFinite(Number(attribution.confidence)) ? Number(attribution.confidence) : null,
        status: 'hypothesis',
        attributionWarning: 'A stored label or source reference does not establish address ownership.'
      });
    }
    const destinationEvidence = node.details?.destinationEvidence;
    if (destinationEvidence?.type) {
      generated.push({
        id: `destination-type:${node.id}`,
        origin: 'derived',
        evidenceClass: destinationEvidence.verified === true ? 'external_record' : 'attribution_hypothesis',
        classification: destinationEvidence.verified === true ? 'Recorded external destination evidence' : 'Destination-type hypothesis',
        statement: `Stored destination type for ${address}: ${destinationEvidence.type}.`,
        sourceReference: destinationEvidence.source || 'Source not recorded',
        sourceStrength: destinationEvidence.verified === true ? 'Marked verified in case data; source must still be reviewed' : 'Unverified case-data hypothesis',
        status: destinationEvidence.verified === true ? 'recorded' : 'hypothesis',
        attributionWarning: 'This record does not establish ownership or control of the address.'
      });
    }
  });

  (caseData.recoveryLeads || []).forEach(lead => {
    (lead.actions || []).filter(action => action.state === 'recovery_confirmed' && action.outcomeEvidence).forEach(action => {
      generated.push({
        id: `outcome:${lead.id}:${action.id}`,
        origin: 'derived',
        evidenceClass: 'investigator_reported_outcome',
        classification: 'Investigator-reported recovery outcome',
        statement: `Recovery outcome recorded for ${lead.address || lead.id}.`,
        sourceReference: action.outcomeEvidence,
        sourceStrength: 'Recorded by investigator; not independently validated by software',
        observedAt: action.updatedAt || action.createdAt,
        status: 'reported',
        attributionWarning: 'The application records this outcome but does not confirm that assets were recovered.'
      });
    });
  });

  const reviewById = caseData.evidenceClaimReviews || {};
  const storedClaims = (caseData.evidenceClaims || []).map(claim => ({ ...claim, origin: 'investigator_entered' }));
  const uniqueGenerated = [...new Map(generated.map(claim => [claim.id, claim])).values()];
  return [...uniqueGenerated, ...storedClaims].map(claim => ({
    ...claim,
    review: reviewById[claim.id] || { status: 'unreviewed', reviewerNote: '', reviewedAt: null }
  }));
}

function pathSignature(nodeIds, linkReferences) {
  return JSON.stringify({ nodeIds, linkReferences });
}

/** Enumerates bounded, simple source-to-terminal routes present in the current graph. */
export function buildAlternativePaths(caseData, { maxPaths = 30, maxHops = 10 } = {}) {
  const nodes = caseData?.nodes || [];
  const links = caseData?.links || [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const taint = calculateTaintMap(nodes, links);
  const edgeTaint = calculateEdgeTaintMap(nodes, links, taint);
  const outgoing = new Map(nodes.map(node => [node.id, []]));
  links.forEach((link, index) => {
    const source = nodeId(link.source);
    const target = nodeId(link.target);
    if (!byId.has(source) || !byId.has(target) || parseSats(link.value) <= 0) return;
    outgoing.get(source).push({ link, index, target, sats: parseSats(link.value) });
  });

  const starts = nodes.filter(node => node.type === 'suspect').map(node => node.id);
  const candidates = [];
  let explored = 0;
  const explorationLimit = 10000;
  const walk = (currentId, pathNodes, pathEdges, visited) => {
    if (candidates.length >= maxPaths || explored >= explorationLimit) return;
    const nextEdges = outgoing.get(currentId) || [];
    if (pathEdges.length > 0 && nextEdges.length === 0) {
      const edges = pathEdges.map(item => item.link);
      const values = pathEdges.map(item => item.sats);
      const taintedValues = pathEdges.map(item => {
        const source = nodeId(item.link.source);
        const target = nodeId(item.link.target);
        return edgeTaint.get(`${source}->${target}`)?.taintedSats || 0;
      });
      const references = pathEdges.map(item => txReference(item.link) || `edge-${item.index}`);
      const directReferences = pathEdges.filter(item => txReference(item.link)).length;
      const ids = pathSignature(pathNodes, references);
      candidates.push({
        id: `path:${encodeURIComponent(ids)}`,
        signature: ids,
        nodeIds: [...pathNodes],
        addressPath: pathNodes.map(id => byId.get(id)?.details?.address || id),
        transactions: edges.map((link, index) => ({ reference: txReference(link), value: link.value || 'Unknown', timestamp: timeReference(link), source: pathNodes[index], target: pathNodes[index + 1] })),
        hopCount: pathEdges.length,
        bottleneckSats: Math.min(...values),
        estimatedTaintedSats: Math.min(...taintedValues),
        directTransactionReferenceCoverage: pathEdges.length ? directReferences / pathEdges.length : 0,
        evidenceLabel: directReferences === pathEdges.length ? 'Every edge has a transaction reference' : directReferences ? `${directReferences}/${pathEdges.length} edges have transaction references` : 'Graph edges only; transaction references unavailable',
        terminalType: byId.get(currentId)?.type || 'unknown'
      });
      return;
    }
    if (pathEdges.length >= maxHops) return;
    for (const edge of nextEdges) {
      explored += 1;
      if (visited.has(edge.target)) continue;
      walk(edge.target, [...pathNodes, edge.target], [...pathEdges, edge], new Set([...visited, edge.target]));
      if (candidates.length >= maxPaths || explored >= explorationLimit) break;
    }
  };
  starts.forEach(start => walk(start, [start], [], new Set([start])));

  const savedReviews = caseData?.pathReviews || {};
  return candidates
    .sort((a, b) => b.estimatedTaintedSats - a.estimatedTaintedSats || b.directTransactionReferenceCoverage - a.directTransactionReferenceCoverage || a.hopCount - b.hopCount)
    .map((path, index) => ({ ...path, rank: index + 1, review: savedReviews[path.signature] || { status: 'unreviewed', rationale: '' } }));
}

export function buildEvidenceGapChecklist(caseData, now = Date.now()) {
  if (!caseData) return [];
  const nodes = caseData.nodes || [];
  const links = caseData.links || [];
  const valueIncoming = new Set(links.filter(link => parseSats(link.value) > 0).map(link => nodeId(link.target)));
  const valueOutgoing = new Set(links.filter(link => parseSats(link.value) > 0).map(link => nodeId(link.source)));
  const receivers = nodes.filter(node => node.type === 'receiver' || (valueIncoming.has(node.id) && !valueOutgoing.has(node.id)));
  const gaps = [];
  const missingTx = links.filter(link => !txReference(link)).length;
  const missingTime = links.filter(link => !hasTemporalEvidence(link)).length;
  if (!nodes.some(node => node.type === 'suspect')) gaps.push({ id: 'origin', priority: 'high', title: 'Trace origin is not identified', detail: 'No suspect/source node is present to seed a fund-flow attribution.', recommendation: 'Record and cite the originating transaction or address.' });
  if (missingTx) gaps.push({ id: 'tx-references', priority: 'high', title: 'Transaction references are missing', detail: `${missingTx} of ${links.length} graph links have no transaction ID.`, recommendation: 'Resolve each material edge to a transaction reference and preserve the source record.' });
  if (missingTime) gaps.push({ id: 'time-metadata', priority: 'medium', title: 'Time or block metadata is incomplete', detail: `${missingTime} links lack a parseable timestamp and block height.`, recommendation: 'Capture confirmation time/block data from the relevant chain source.' });
  if (!caseData.traceMeta?.confidence) gaps.push({ id: 'trace-method', priority: 'medium', title: 'Trace method metadata is absent', detail: 'The case has no recorded trace confidence/method metadata.', recommendation: 'Document the tracing method, assumptions, and any halted or ambiguous branches.' });
  if (!caseData.traceMeta?.confidence || caseData.traceMeta.confidence < 0.7) gaps.push({ id: 'trace-confidence', priority: 'medium', title: 'Trace attribution needs corroboration', detail: 'Trace confidence is absent or below 70%; taint models remain analytical estimates.', recommendation: 'Review alternative routes and preserve the reasoning for the selected path.' });

  receivers.forEach(node => {
    const destinationEvidence = node.details?.destinationEvidence;
    const contact = node.details?.verifiedContact;
    const contactVerifiedAt = contact?.verifiedAt ? Date.parse(contact.verifiedAt) : NaN;
    if (destinationEvidence?.verified !== true || !destinationEvidence.source) gaps.push({ id: `destination:${node.id}`, priority: 'high', title: `Destination type is unknown for ${node.details?.address || node.id}`, detail: 'Address format and transaction behavior do not establish a service or address owner.', recommendation: 'Seek independent attribution evidence and record its source; retain the entity as unknown until then.' });
    if (node.details?.outspendSpent == null && node.details?.availableBalanceVerified !== true) gaps.push({ id: `availability:${node.id}`, priority: 'high', title: 'Current asset availability is unknown', detail: 'No verified unspent status or independently supported available balance is recorded.', recommendation: 'Refresh chain state and distinguish traceable value from currently available value.' });
    if (contact?.verified !== true || !contact.source) gaps.push({ id: `contact:${node.id}`, priority: 'medium', title: `No contact record marked verified for ${node.details?.address || node.id}`, detail: 'No sourced contact record is explicitly marked verified in the case data.', recommendation: 'Independently confirm the channel before sending a request and record the source and verification date.' });
    else if (!Number.isFinite(contactVerifiedAt) || now - contactVerifiedAt > 90 * 86400000) gaps.push({ id: `contact-freshness:${node.id}`, priority: 'medium', title: `Service contact may be stale for ${node.details?.address || node.id}`, detail: 'The verification date is missing or more than 90 days old.', recommendation: 'Reconfirm contact details through an independent source before relying on them.' });
  });

  const actions = (caseData.recoveryLeads || []).flatMap(lead => lead.actions || []);
  const paths = buildAlternativePaths(caseData);
  const unreviewedPaths = paths.filter(path => path.review.status === 'unreviewed');
  if (paths.length > 1 && unreviewedPaths.length) gaps.push({ id: 'alternative-path-review', priority: 'medium', title: 'Some alternative routes remain unreviewed', detail: `${unreviewedPaths.length} of ${paths.length} candidate routes have no investigator disposition.`, recommendation: 'Compare route evidence and record which path needs further review, corroboration, or rejection with rationale.' });
  const unsupportedActions = actions.filter(action => !String(action.evidence || '').trim());
  if (unsupportedActions.length) gaps.push({ id: 'action-evidence', priority: 'medium', title: 'Follow-up actions lack supporting references', detail: `${unsupportedActions.length} action record(s) have no evidence reference or case note.`, recommendation: 'Attach the request ID, communication log reference, or reason the action was taken.' });
  const unresolvedDue = actions.filter(action => {
    if (['completed', 'unable_to_proceed', 'recovery_confirmed'].includes(action.state)) return false;
    const explicitDue = action.nextFollowUpAt ? Date.parse(action.nextFollowUpAt) : NaN;
    const updatedAt = action.updatedAt ? Date.parse(action.updatedAt) : NaN;
    const dueAt = Number.isFinite(explicitDue) ? explicitDue
      : Number.isFinite(updatedAt) && ['submitted', 'awaiting_response'].includes(action.state) ? updatedAt + 7 * 86400000 : NaN;
    return Number.isFinite(dueAt) && dueAt <= now;
  });
  if (unresolvedDue.length) gaps.push({ id: 'overdue-followups', priority: 'high', title: 'Recovery follow-up is overdue', detail: `${unresolvedDue.length} open follow-up(s) reached their recorded due date.`, recommendation: 'Review the latest response status and update the action record.' });
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return gaps.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}
