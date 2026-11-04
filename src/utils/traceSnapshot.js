import { hashEvidencePayload, serializeEvidencePayload } from './evidenceIntegrity';

const SNAPSHOT_FORMAT = 'aegistrace-trace-snapshot';
const SNAPSHOT_VERSION = 1;
const SNAPSHOT_DISCLAIMER = 'The digest detects changes to this snapshot payload. It does not authenticate data sources, establish attribution, or prove legal admissibility.';
const DIGEST_SCOPE = 'Canonical JSON of format, version, capturedAt, and caseData.';
const DIGEST_PATTERN = /^SHA256:[0-9A-F]{64}$/;

function snapshotDigestPayload(snapshot) {
  return {
    format: snapshot.format,
    version: snapshot.version,
    capturedAt: snapshot.capturedAt,
    caseData: snapshot.caseData,
  };
}

function isSupportedSnapshot(snapshot) {
  return snapshot?.format === SNAPSHOT_FORMAT &&
    snapshot.version === SNAPSHOT_VERSION &&
    typeof snapshot.capturedAt === 'string' &&
    !Number.isNaN(Date.parse(snapshot.capturedAt)) &&
    snapshot.caseData &&
    typeof snapshot.caseData.id === 'string' &&
    Array.isArray(snapshot.caseData.nodes) &&
    Array.isArray(snapshot.caseData.links) &&
    snapshot.integrity?.algorithm === 'SHA-256' &&
    snapshot.integrity?.scope === DIGEST_SCOPE &&
    DIGEST_PATTERN.test(snapshot.integrity?.digest || '');
}

export async function createTraceSnapshot(caseData, {
  capturedAt = new Date().toISOString(),
  cryptoProvider = globalThis.crypto,
} = {}) {
  if (!caseData || typeof caseData !== 'object' || typeof caseData.id !== 'string' ||
      !Array.isArray(caseData.nodes) || !Array.isArray(caseData.links)) {
    throw new Error('A case with an ID, graph nodes, and links is required to create a trace snapshot.');
  }
  if (typeof capturedAt !== 'string' || Number.isNaN(Date.parse(capturedAt))) {
    throw new Error('Snapshot capture time must be a valid date string.');
  }

  const caseSnapshot = JSON.parse(JSON.stringify(caseData));
  const snapshot = {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    capturedAt,
    caseData: caseSnapshot,
    integrity: {
      algorithm: 'SHA-256',
      scope: DIGEST_SCOPE,
    },
    disclaimer: SNAPSHOT_DISCLAIMER,
  };
  const digest = await hashEvidencePayload(snapshotDigestPayload(snapshot), cryptoProvider);

  return {
    ...snapshot,
    integrity: { ...snapshot.integrity, digest },
  };
}

export async function verifyTraceSnapshot(snapshot, { cryptoProvider = globalThis.crypto } = {}) {
  if (!isSupportedSnapshot(snapshot)) {
    return { valid: false, status: 'UNSUPPORTED', reason: 'Unsupported snapshot format or missing required fields.' };
  }

  const computedDigest = await hashEvidencePayload(snapshotDigestPayload(snapshot), cryptoProvider);
  const expectedDigest = snapshot.integrity.digest;
  const valid = computedDigest === expectedDigest;
  return {
    valid,
    status: valid ? 'VERIFIED_INTEGRITY' : 'DIGEST_MISMATCH',
    expectedDigest,
    computedDigest,
    reason: valid
      ? 'Snapshot payload matches its recorded digest.'
      : 'Snapshot payload does not match its recorded digest.',
  };
}

function unique(values) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.length > 0))].sort();
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter(value => !rightSet.has(value));
}

function compareRecords(earlierRecords, laterRecords, keyFor) {
  const earlier = new Map(earlierRecords.map(record => [keyFor(record), record]));
  const later = new Map(laterRecords.map(record => [keyFor(record), record]));
  const added = [...later.keys()].filter(key => !earlier.has(key));
  const removed = [...earlier.keys()].filter(key => !later.has(key));
  const changed = [...earlier.keys()].filter(key =>
    later.has(key) && serializeEvidencePayload(earlier.get(key)) !== serializeEvidencePayload(later.get(key))
  );
  return { earlier: earlier.size, later: later.size, added, removed, changed };
}

function snapshotWarnings(snapshot) {
  return unique(snapshot.caseData.traceMeta?.warnings || []);
}

export function compareTraceSnapshots(earlier, later) {
  if (!isSupportedSnapshot(earlier) || !isSupportedSnapshot(later)) {
    throw new Error('Two supported trace snapshots are required for comparison.');
  }
  if (earlier.caseData.id !== later.caseData.id) {
    throw new Error('Snapshots must belong to the same case to compare.');
  }

  const txIds = snapshot => unique((snapshot.caseData.links || []).map(link => link?.txid));
  const earlierTxIds = txIds(earlier);
  const laterTxIds = txIds(later);
  const oldWarnings = snapshotWarnings(earlier);
  const newWarnings = snapshotWarnings(later);
  const nodeRecords = snapshot => snapshot.caseData.nodes.filter(node => typeof node?.id === 'string');
  const linkRecords = snapshot => snapshot.caseData.links.map((link, index) => {
    const source = typeof link.source === 'object' && link.source ? link.source.id : link.source;
    const target = typeof link.target === 'object' && link.target ? link.target.id : link.target;
    const identity = `${link.txid || ''}:${link.outputIndex ?? ''}:${link.inputOutpoint || ''}:${source || ''}:${target || ''}`;
    return {
      key: identity === '::::' ? `${identity}:${index}` : identity,
      link,
    };
  });
  const nodeDelta = compareRecords(nodeRecords(earlier), nodeRecords(later), node => node.id);
  const linkDelta = compareRecords(linkRecords(earlier), linkRecords(later), link => link.key);
  const coverage = snapshot => {
    const meta = snapshot.caseData.traceMeta || {};
    const stats = meta.stats || {};
    const history = meta.addressHistoryScan;
    return {
      prunedBranches: stats.prunedBranches?.length || 0,
      omittedNodes: stats.omittedNodeCount || 0,
      omittedLinks: stats.omittedLinkCount || 0,
      addressHistoryComplete: history ? history.complete === true : null,
      addressHistoryPages: history?.pagesScanned ?? null,
      addressHistoryTransactions: history?.transactionsScanned ?? null,
    };
  };

  return {
    caseId: earlier.caseData.id,
    earlierCapturedAt: earlier.capturedAt,
    laterCapturedAt: later.capturedAt,
    nodes: {
      ...nodeDelta,
    },
    links: {
      ...linkDelta,
    },
    transactionReferences: {
      earlier: earlierTxIds.length,
      later: laterTxIds.length,
      added: difference(laterTxIds, earlierTxIds),
      removed: difference(earlierTxIds, laterTxIds),
    },
    sourceManifest: compareRecords(
      earlier.caseData.traceMeta?.collection?.sourceManifest || [],
      later.caseData.traceMeta?.collection?.sourceManifest || [],
      entry => entry?.txid || serializeEvidencePayload(entry)
    ),
    warnings: {
      added: difference(newWarnings, oldWarnings),
      cleared: difference(oldWarnings, newWarnings),
      unchanged: oldWarnings.filter(warning => newWarnings.includes(warning)),
    },
    coverage: {
      earlier: coverage(earlier),
      later: coverage(later),
    },
  };
}
