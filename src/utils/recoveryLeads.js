import { calculateEdgeTaintMap, calculateTaintMap, parseSats } from './taintAnalysis';

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
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw < 1e12 ? raw * 1000 : raw;
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

function scoreEvidence(node, flows = [], deduplicationAmbiguous = false) {
  const nodeEvidence = node.details?.attributionEvidence;
  const evidence = nodeEvidence || null;
  const hasVerifiedTxReference = flows.some(flow => Boolean(flow.link.txid || flow.link.transactionId) && (flow.link.blockTime != null || flow.link.block_time != null));
  const onChain = hasVerifiedTxReference ? 0.9 : 0;
  const declaredConfidence = Number(evidence?.confidence);
  const attribution = Number.isFinite(declaredConfidence)
    ? Math.max(0, Math.min(1, declaredConfidence))
    : evidence?.verified === true ? 0.9 : evidence?.source ? 0.4 : 0;
  const contact = node.details?.verifiedContact?.verified === true && node.details?.verifiedContact?.source ? 1 : 0;
  return {
    onChain,
    attribution,
    contact,
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
    const recency = lastTime == null ? 0.2 : Math.max(0, Math.min(1, 1 - Math.max(0, now - lastTime) / (90 * DAY_MS)));
    const evidence = scoreEvidence(destinationNode, flows, deduplicated.ambiguous);
    const destination = verifiedDestination(destinationNode);
    const isVerifiedUnspent = destinationNode.details?.outspendSpent === false;
    const availableSats = isVerifiedUnspent
      ? Math.min(attributedSats, parseSats(destinationNode.balance))
      : destinationNode.details?.availableBalanceVerified === true
        ? Math.min(attributedSats, parseSats(destinationNode.details.availableBalance)) : 0;
    const valueFactor = Math.min(1, Math.log10(1 + attributedSats / 1e8) / 2);
    const rankScore = Math.round(100 * (valueFactor * 0.35 + recency * 0.2 + evidence.combined * 0.45));
    const lead = {
      id: `lead_${encodeURIComponent(address)}`,
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
      lastTransactionId: lastFlow?.link?.txid || lastFlow?.link?.transactionId || lastFlow?.link?.details?.txid || null,
      destinationType: destination.type,
      destinationEvidence: destination.evidence,
      evidence: {
        onChain: { confidence: evidence.onChain, reference: lastFlow?.link?.txid || lastFlow?.link?.transactionId || null },
        attributionHypothesis: { confidence: evidence.attribution, source: evidence.evidence?.source || null, verified: evidence.evidence?.verified === true },
        confirmedRecovery: { status: 'not_confirmed', evidence: null }
      },
      verifiedContact: evidence.contact === 1 ? destinationNode.details.verifiedContact : null,
      scoreFactors: { value: valueFactor, recency, evidence: evidence.combined, evidenceBreakdown: { onChain: evidence.onChain, attribution: evidence.attribution, contact: evidence.contact, deduplicationAmbiguous: deduplicated.ambiguous } },
      rankScore,
      priority: rankScore >= 70 ? 'High' : rankScore >= 40 ? 'Medium' : 'Low',
      actions: []
    };
    queue.enqueue(lead, rankScore);
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

export function formatLeadAmount(sats, currency = 'BTC') {
  return `${(sats / 1e8).toFixed(4)} ${currency}`;
}
