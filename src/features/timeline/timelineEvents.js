const asNodeId = value => typeof value === 'object' && value ? value.id : value;

function parseEventTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 1e12 ? value * 1000 : value;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim();
  if (['on-chain', 'settled', 'embedded', 'unknown'].includes(normalized.toLowerCase())) return null;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildInvestigationTimeline(caseData) {
  if (!caseData) return [];
  const entries = [];
  const add = (entry, timestamp) => {
    entries.push({ ...entry, timestamp, time: parseEventTime(timestamp) });
  };

  (Array.isArray(caseData.links) ? caseData.links : []).forEach((link, index) => {
    const reference = link.txid || link.transactionId || link.details?.txid;
    if (!reference && !parseEventTime(link.blockTime ?? link.block_time ?? link.timestamp)) return;
    const source = asNodeId(link.source) || 'Unknown source';
    const target = asNodeId(link.target) || 'Unknown destination';
    add({
      id: `flow:${reference || index}:${source}:${target}`,
      kind: 'Trace flow',
      summary: `${source} → ${target} · ${link.value || 'value unavailable'}`,
      reference: reference || null
    }, link.blockTime ?? link.block_time ?? link.timestamp);
  });

  (Array.isArray(caseData.notesList) ? caseData.notesList : []).forEach(note => add({
    id: note.id || `note:${note.timestamp}:${note.content}`,
    kind: 'Case note',
    summary: note.content || 'Case note',
    reference: note.author || null
  }, note.timestamp));

  (Array.isArray(caseData.recoveryLeads) ? caseData.recoveryLeads : []).forEach(lead => {
    (Array.isArray(lead.actions) ? lead.actions : []).forEach(action => {
      add({
        id: `recovery:${lead.id}:${action.id}:created`,
        kind: 'Recovery action',
        summary: `${action.type || 'Follow-up action'} · ${String(action.state || 'planned').replaceAll('_', ' ')}`,
        reference: action.evidence || lead.address || null
      }, action.createdAt);
      (Array.isArray(action.history) ? action.history : []).forEach((event, index) => add({
        id: `recovery:${lead.id}:${action.id}:history:${index}`,
        kind: 'Recovery action update',
        summary: `${action.type || 'Follow-up action'} · ${event.event || (event.to ? `status ${event.from || 'unknown'} to ${event.to}` : 'updated')}`,
        reference: event.evidence || null
      }, event.timestamp));
    });
  });

  (Array.isArray(caseData.evidenceClaims) ? caseData.evidenceClaims : []).forEach(claim => add({
    id: `claim:${claim.id}:created`,
    kind: 'Evidence claim',
    summary: `${claim.classification || 'Claim'} · ${claim.statement || 'Claim recorded'}`,
    reference: claim.sourceReference || null
  }, claim.createdAt));

  Object.entries(caseData.evidenceClaimReviews && typeof caseData.evidenceClaimReviews === 'object'
    ? caseData.evidenceClaimReviews
    : {}).forEach(([claimId, review]) => {
    if (!review?.reviewedAt) return;
    add({
      id: `claim:${claimId}:review`,
      kind: 'Evidence review',
      summary: `Review status: ${String(review.status || 'updated').replaceAll('_', ' ')}`,
      reference: review.reviewerNote || claimId
    }, review.reviewedAt);
  });

  return entries.sort((a, b) => (b.time ?? -Infinity) - (a.time ?? -Infinity) || a.id.localeCompare(b.id));
}

export function filterTimeline(entries = [], { query = '', kind = 'all' } = {}) {
  const normalizedQuery = query.trim().toLowerCase();
  return entries.filter(entry =>
    (kind === 'all' || entry.kind === kind) &&
    (!normalizedQuery || `${entry.summary} ${entry.reference || ''}`.toLowerCase().includes(normalizedQuery))
  );
}
