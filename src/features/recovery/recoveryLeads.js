import { calculateEdgeTaintMap, calculateTaintMap, parseSats } from '../../utils/taintAnalysis';

const DAY_MS = 86400000;

export const RECOVERY_ACTION_STATES = Object.freeze({
  PLANNED: 'planned',
  PREPARING: 'preparing',
  SUBMITTED: 'submitted',
  AWAITING_RESPONSE: 'awaiting_response',
  COMPLETED: 'completed',
  UNABLE_TO_PROCEED: 'unable_to_proceed',
  RECOVERY_CONFIRMED: 'recovery_confirmed'
});

const ACTION_TRANSITIONS = Object.freeze({
  planned: ['preparing', 'submitted', 'unable_to_proceed'],
  preparing: ['submitted', 'unable_to_proceed'],
  submitted: ['awaiting_response', 'completed', 'unable_to_proceed', 'recovery_confirmed'],
  awaiting_response: ['completed', 'unable_to_proceed', 'recovery_confirmed'],
  completed: ['recovery_confirmed'],
  unable_to_proceed: ['planned'],
  recovery_confirmed: []
});

export function getRecoveryActionTransitions(action) {
  const state = action?.state || RECOVERY_ACTION_STATES.PLANNED;
  return ACTION_TRANSITIONS[state] || [];
}

function normalizeEndpoint(value) {
  return typeof value === 'object' && value ? value.id : value;
}

function getEdgeIdentity(link, source, target) {
  const txid = link.txid || link.transactionId || link.details?.txid;
  return txid ? `${txid}:${source}:${target}:${parseSats(link.value)}` : null;
}

function deduplicateLinks(links = []) {
  const seen = new Set();
  let ambiguous = false;
  const unique = links.filter(link => {
    const source = normalizeEndpoint(link.source);
    const target = normalizeEndpoint(link.target);
    const identity = getEdgeIdentity(link, source, target);
    if (!identity) {
      ambiguous = true;
      return true;
    }
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  return { links: unique, ambiguous };
}

function observedTime(link) {
  const raw = link?.blockTime ?? link?.block_time ?? link?.timestamp;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const time = raw < 1e12 ? raw * 1000 : raw;
    return Number.isFinite(new Date(time).getTime()) ? time : null;
  }
  if (typeof raw !== 'string' || ['On-chain', 'Settled', 'Embedded'].includes(raw)) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function verifiedDestination(node) {
  const evidence = node.details?.destinationEvidence;
  if (evidence?.verified !== true || !evidence.source || !evidence.type) {
    return { type: 'Unknown', evidence: null };
  }
  return { type: evidence.type, evidence };
}

function hasTransactionReferenceContext(link) {
  const hasReference = Boolean(link?.txid || link?.transactionId || link?.details?.txid);
  if (!hasReference) return false;
  const height = Number(link.blockHeight ?? link.block_height);
  if (Number.isFinite(height) && height > 0) return true;
  const rawTime = link.blockTime ?? link.block_time ?? link.timestamp;
  if (typeof rawTime === 'number') return Number.isFinite(rawTime) && Number.isFinite(new Date(rawTime < 1e12 ? rawTime * 1000 : rawTime).getTime());
  return typeof rawTime === 'string' && !['on-chain', 'settled', 'embedded', 'unknown'].includes(rawTime.trim().toLowerCase()) && Number.isFinite(Date.parse(rawTime));
}

function scoreEvidence(node, flows = [], deduplicationAmbiguous = false, now = Date.now()) {
  const nodeEvidence = node.details?.attributionEvidence;
  const evidence = nodeEvidence || null;
  const onChain = flows.length ? flows.filter(flow => hasTransactionReferenceContext(flow.link)).length / flows.length : 0;
  const declaredConfidence = Number(evidence?.confidence);
  const attribution = Number.isFinite(declaredConfidence)
    ? Math.max(0, Math.min(1, declaredConfidence))
    : evidence?.verified === true ? 0.9 : evidence?.source ? 0.4 : 0;
  const contactRecord = node.details?.verifiedContact;
  const contactVerifiedAt = contactRecord?.verifiedAt ? Date.parse(contactRecord.verifiedAt) : NaN;
  const contactAgeDays = Number.isFinite(contactVerifiedAt) ? Math.max(0, (now - contactVerifiedAt) / DAY_MS) : null;
  const contact = contactRecord?.verified === true && contactRecord.source
    ? contactAgeDays == null ? 0.5 : contactAgeDays <= 90 ? 1 : 0.25
    : 0;
  return {
    onChain,
    attribution,
    contact,
    contactAgeDays,
    contactFreshness: contact === 0 ? 'unknown' : contactAgeDays == null ? 'date unavailable' : contactAgeDays <= 90 ? 'current' : 'stale',
    evidence,
    combined: Math.max(0, onChain * 0.4 + attribution * 0.4 + contact * 0.2 - (deduplicationAmbiguous ? 0.1 : 0))
  };
}

/** A small max-priority queue for deterministic, explainable lead scheduling. */
export class RecoveryPriorityQueue {
  constructor() { this.items = []; }
  enqueue(item, priority = item.rankScore || 0) {
    this.items.push({ item, priority });
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].priority >= this.items[index].priority) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }
  dequeue() {
    if (!this.items.length) return null;
    const top = this.items[0].item;
    const last = this.items.pop();
    if (this.items.length) {
      this.items[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let largest = index;
        if (left < this.items.length && this.items[left].priority > this.items[largest].priority) largest = left;
        if (right < this.items.length && this.items[right].priority > this.items[largest].priority) largest = right;
        if (largest === index) break;
        [this.items[index], this.items[largest]] = [this.items[largest], this.items[index]];
        index = largest;
      }
    }
    return top;
  }
  get size() { return this.items.length; }
}

/** Only terminal, value-bearing destinations become recovery leads. Intermediary hops remain trace context. */
export function buildRecoveryLeads(caseData, now = Date.now()) {
  const nodes = caseData?.nodes || [];
  const deduplicated = deduplicateLinks(caseData?.links || []);
  const links = deduplicated.links;
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const nodeTaint = calculateTaintMap(nodes, links);
  const edgeTaint = calculateEdgeTaintMap(nodes, links, nodeTaint);
  const incoming = new Map(nodes.map(node => [node.id, []]));
  const outgoing = new Map(nodes.map(node => [node.id, []]));

  const graphEdges = new Map();
  links.forEach(link => {
    const source = normalizeEndpoint(link.source);
    const target = normalizeEndpoint(link.target);
    if (!nodeById.has(source) || !nodeById.has(target) || parseSats(link.value) <= 0) return;
    const key = `${source}->${target}`;
    if (!graphEdges.has(key)) graphEdges.set(key, { source, target, links: [] });
    graphEdges.get(key).links.push(link);
  });
  graphEdges.forEach(edgeRecord => {
    const taint = edgeTaint.get(`${edgeRecord.source}->${edgeRecord.target}`);
    const representative = [...edgeRecord.links].sort((a, b) => (observedTime(b) || 0) - (observedTime(a) || 0))[0];
    incoming.get(edgeRecord.target).push({
      source: edgeRecord.source,
      link: representative,
      totalSats: taint?.totalSats || 0,
      taintedSats: taint?.taintedSats || 0
    });
    outgoing.get(edgeRecord.source).push({ target: edgeRecord.target, sats: taint?.totalSats || 0 });
  });

  const grouped = new Map();
  nodes.forEach(node => {
    if (node.type === 'suspect' || !incoming.get(node.id).length || outgoing.get(node.id).length) return;
    if (node.type === 'transaction' || node.type === 'tx' || node.type === 'op_return') return;
    if (node.details?.outspendSpent === true && !/exchange|service|custod/i.test(verifiedDestination(node).type)) return;
    const address = node.details?.address || node.id;
    const bucket = grouped.get(address) || { nodes: [], inflows: [] };
    bucket.nodes.push(node);
    bucket.inflows.push(...incoming.get(node.id));
    grouped.set(address, bucket);
  });

  const queue = new RecoveryPriorityQueue();
  grouped.forEach((bucket, address) => {
    const destinationNode = bucket.nodes[0];
    const uniqueFlows = new Map();
    bucket.inflows.forEach(flow => {
      const identity = `${flow.source}->${destinationNode.id}`;
      if (!uniqueFlows.has(identity)) uniqueFlows.set(identity, flow);
    });
    const flows = [...uniqueFlows.values()];
    const attributedSats = flows.reduce((sum, flow) => sum + flow.taintedSats, 0);
    const movedSats = flows.reduce((sum, flow) => sum + flow.totalSats, 0);
    if (attributedSats <= 0) return;
    const sortedFlows = [...flows].sort((a, b) => (observedTime(b.link) || 0) - (observedTime(a.link) || 0));
    const lastFlow = sortedFlows[0];
    const lastTime = observedTime(lastFlow?.link);
    const ageDays = lastTime == null ? null : Math.max(0, (now - lastTime) / DAY_MS);
    const recency = ageDays == null ? 0 : Math.max(0, Math.min(1, 1 - ageDays / 90));
    const freshness = ageDays == null ? 'unknown' : ageDays <= 7 ? 'current' : ageDays <= 30 ? 'aging' : 'stale';
    const lastReviewedAt = (caseData.recoveryLeads || []).find(item => item.id === `lead_${encodeURIComponent(address)}`)?.lastReviewedAt || null;
    const reviewAgeDays = lastReviewedAt && Number.isFinite(Date.parse(lastReviewedAt)) ? Math.max(0, (now - Date.parse(lastReviewedAt)) / DAY_MS) : null;
    const reviewFreshness = reviewAgeDays == null ? 'not reviewed' : reviewAgeDays <= 7 ? 'current' : reviewAgeDays <= 30 ? 'due for review' : 'stale review';
    const evidence = scoreEvidence(destinationNode, flows, deduplicated.ambiguous, now);
    const destination = verifiedDestination(destinationNode);
    const isVerifiedUnspent = destinationNode.details?.outspendSpent === false;
    const availableSats = isVerifiedUnspent
      ? Math.min(attributedSats, parseSats(destinationNode.balance))
      : destinationNode.details?.availableBalanceVerified === true
        ? Math.min(attributedSats, parseSats(destinationNode.details.availableBalance)) : 0;
    const valueFactor = Math.min(1, Math.log10(1 + attributedSats / 1e8) / 2);
    const rankScore = Math.round(100 * (valueFactor * 0.35 + recency * 0.2 + evidence.combined * 0.45));
    const leadId = `lead_${encodeURIComponent(address)}`;
    const savedLead = (caseData.recoveryLeads || []).find(item => item.id === leadId);
    const activeActions = (savedLead?.actions || []).filter(action => !['completed', 'unable_to_proceed', 'recovery_confirmed'].includes(action.state));
    const latestAction = [...activeActions].sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0))[0] || null;
    const latestActionUpdatedAt = latestAction?.updatedAt ? Date.parse(latestAction.updatedAt) : NaN;
    const defaultFollowUp = Number.isFinite(latestActionUpdatedAt) && ['submitted', 'awaiting_response'].includes(latestAction?.state)
      ? latestActionUpdatedAt + 7 * DAY_MS : null;
    const explicitDueAt = latestAction?.nextFollowUpAt && Number.isFinite(Date.parse(latestAction.nextFollowUpAt)) ? latestAction.nextFollowUpAt : null;
    const followUpDueAt = explicitDueAt || (defaultFollowUp ? new Date(defaultFollowUp).toISOString() : null);
    const followUpDueMs = followUpDueAt ? Date.parse(followUpDueAt) : NaN;
    const followUpUrgency = !Number.isFinite(followUpDueMs) ? 'not scheduled' : followUpDueMs <= now ? 'overdue' : followUpDueMs - now <= 2 * DAY_MS ? 'due soon' : 'scheduled';
    const schedulingBoost = followUpUrgency === 'overdue' ? 15 : followUpUrgency === 'due soon' ? 7 : 0;
    const schedulingScore = Math.min(100, rankScore + schedulingBoost);
    const lead = {
      id: leadId,
      address,
      label: destination.type === 'Unknown' ? 'Unclassified destination' : destination.type,
      currency: caseData.currency || 'BTC',
      attributedSats,
      movedSats,
      availableSats,
      recoverability: isVerifiedUnspent ? 'unspent_confirmed' : destinationNode.details?.outspendSpent === true ? 'spent_at_destination' : 'trace_boundary_unknown',
      amountBasis: deduplicated.ambiguous
        ? 'flow amount may include overlapping unidentified records'
        : 'gross destination flow and tainted subset; current availability requires an unspent output',
      deduplicationAmbiguous: deduplicated.ambiguous,
      lastObserved: lastTime == null ? 'Transaction time unavailable' : new Date(lastTime).toISOString(),
      lastObservedAgeDays: ageDays,
      freshness,
      lastReviewedAt,
      reviewFreshness,
      reviewNote: savedLead?.reviewNote || '',
      lastTransactionId: lastFlow?.link?.txid || lastFlow?.link?.transactionId || lastFlow?.link?.details?.txid || null,
      destinationType: destination.type,
      destinationEvidence: destination.evidence,
      evidence: {
        onChain: { referenceCoverage: evidence.onChain, reference: lastFlow?.link?.txid || lastFlow?.link?.transactionId || null },
        attributionHypothesis: { confidence: evidence.attribution, source: evidence.evidence?.source || null, verified: evidence.evidence?.verified === true },
        confirmedRecovery: { status: 'not_confirmed', evidence: null }
      },
      verifiedContact: evidence.contact > 0 ? destinationNode.details.verifiedContact : null,
      contactFreshness: evidence.contactFreshness,
      followUpDueAt,
      followUpUrgency,
      schedulingScore,
      scoreFactors: { value: valueFactor, recency, freshness, evidence: evidence.combined, evidenceBreakdown: { onChain: evidence.onChain, attribution: evidence.attribution, contact: evidence.contact, contactFreshness: evidence.contactFreshness, deduplicationAmbiguous: deduplicated.ambiguous } },
      rankScore,
      priority: rankScore >= 70 ? 'High' : rankScore >= 40 ? 'Medium' : 'Low',
      actions: []
    };
    queue.enqueue(lead, schedulingScore);
  });

  const results = [];
  while (queue.size) results.push(queue.dequeue());
  return results;
}

export function transitionRecoveryAction(action, nextState, { outcomeEvidence } = {}) {
  const currentState = action?.state || RECOVERY_ACTION_STATES.PLANNED;
  if (!ACTION_TRANSITIONS[currentState]?.includes(nextState)) {
    return { ok: false, error: `Invalid action transition: ${currentState} -> ${nextState}` };
  }
  if (nextState === RECOVERY_ACTION_STATES.RECOVERY_CONFIRMED && !String(outcomeEvidence || '').trim()) {
    return { ok: false, error: 'Confirmed recovery requires supporting outcome evidence.' };
  }
  const timestamp = new Date().toISOString();
  const updatedAction = {
    ...action,
    state: nextState,
    outcomeEvidence: nextState === RECOVERY_ACTION_STATES.RECOVERY_CONFIRMED ? String(outcomeEvidence || action.outcomeEvidence || '').trim() : action.outcomeEvidence || null,
    updatedAt: timestamp,
    history: [...(action.history || []), {
      from: currentState,
      to: nextState,
      timestamp,
      evidence: nextState === RECOVERY_ACTION_STATES.RECOVERY_CONFIRMED ? String(outcomeEvidence || action.outcomeEvidence || '').trim() : action.evidence || null
    }]
  };
  return {
    ok: true,
    action: updatedAction
  };
}

export function updateRecoveryActionRecord(action, patch) {
  if (patch?.state !== undefined) {
    if (!patch.state) return { ok: false, error: 'Recovery action status cannot be empty.' };
    return transitionRecoveryAction(action, patch.state, { outcomeEvidence: patch.outcomeEvidence });
  }

  const editableFields = ['evidence', 'nextFollowUpAt', 'outcomeEvidence'];
  const changes = editableFields.filter(field =>
    Object.prototype.hasOwnProperty.call(patch || {}, field) && patch[field] !== action?.[field]
  );
  if (Object.keys(patch || {}).some(field => !editableFields.includes(field))) {
    return { ok: false, error: 'Recovery action update contains unsupported fields.' };
  }
  if (!changes.length) return { ok: true, action };
  if (changes.includes('evidence') && typeof patch.evidence !== 'string') {
    return { ok: false, error: 'Action evidence must be text.' };
  }
  if (changes.includes('outcomeEvidence') && typeof patch.outcomeEvidence !== 'string') {
    return { ok: false, error: 'Recovery outcome evidence must be text.' };
  }
  if (changes.includes('nextFollowUpAt') &&
      patch.nextFollowUpAt !== null &&
      (typeof patch.nextFollowUpAt !== 'string' || !Number.isFinite(Date.parse(patch.nextFollowUpAt)))) {
    return { ok: false, error: 'Follow-up date must be a valid date or empty.' };
  }

  const timestamp = new Date().toISOString();
  return {
    ok: true,
    action: {
      ...action,
      ...Object.fromEntries(changes.map(field => [field, patch[field]])),
      updatedAt: timestamp,
      history: [...(Array.isArray(action?.history) ? action.history : []), {
        event: 'details_updated',
        state: action?.state || RECOVERY_ACTION_STATES.PLANNED,
        timestamp,
        changes,
        evidence: changes.includes('evidence') ? patch.evidence : action?.evidence || null,
      }],
    },
  };
}

export function formatLeadAmount(sats, currency = 'BTC') {
  return `${(sats / 1e8).toFixed(4)} ${currency}`;
}
