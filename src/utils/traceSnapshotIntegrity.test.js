import { describe, expect, it } from 'vitest';
import { compareTraceSnapshots, createTraceSnapshot, verifyTraceSnapshot } from './traceSnapshot';
import { hashEvidencePayload } from './evidenceIntegrity';

const cryptoProvider = {
  subtle: {
    async digest(_algorithm, bytes) {
      const checksum = new Uint8Array(bytes).reduce((sum, byte) => (sum + byte) % 256, 0);
      return new Uint8Array(32).fill(checksum).buffer;
    },
  },
};

function caseData(overrides = {}) {
  return {
    id: 'case-compare',
    nodes: [{ id: 'source', label: 'Source' }, { id: 'receiver', label: 'Receiver' }],
    links: [{ source: 'source', target: 'receiver', value: '1 BTC', txid: 'tx-one' }],
    traceMeta: {
      warnings: ['Branch limit reached'],
      stats: { prunedBranches: [{}], omittedNodeCount: 1, omittedLinkCount: 2 },
      collection: { sourceManifest: [{ txid: 'tx-one' }] },
    },
    ...overrides,
  };
}

describe('trace snapshot verification and comparison', () => {
  it('verifies a snapshot and detects payload edits', async () => {
    const snapshot = await createTraceSnapshot(caseData(), {
      capturedAt: '2026-11-04T00:00:00.000Z',
      cryptoProvider,
    });
    expect((await verifyTraceSnapshot(snapshot, { cryptoProvider })).status).toBe('VERIFIED_INTEGRITY');

    snapshot.caseData.nodes[0].label = 'Changed source';
    const result = await verifyTraceSnapshot(snapshot, { cryptoProvider });
    expect(result.status).toBe('DIGEST_MISMATCH');
    expect(result.valid).toBe(false);
  });

  it('rejects unsupported snapshot formats', async () => {
    await expect(verifyTraceSnapshot({ format: 'other' })).resolves.toMatchObject({
      valid: false,
      status: 'UNSUPPORTED',
    });
  });

  it('accepts version-one digests created before the verifier was added', async () => {
    const payload = {
      format: 'aegistrace-trace-snapshot',
      version: 1,
      capturedAt: '2026-11-04T00:00:00.000Z',
      caseData: caseData(),
    };
    const digest = await hashEvidencePayload(payload, cryptoProvider);
    const snapshot = {
      ...payload,
      integrity: {
        algorithm: 'SHA-256',
        digest,
        scope: 'Canonical JSON of format, version, capturedAt, and caseData.',
      },
      disclaimer: 'Legacy snapshot disclaimer.',
    };
    expect((await verifyTraceSnapshot(snapshot, { cryptoProvider })).valid).toBe(true);
    expect(snapshot.integrity.scope).toBe('Canonical JSON of format, version, capturedAt, and caseData.');
  });

  it('compares verified same-case graph and trace coverage changes', async () => {
    const earlier = await createTraceSnapshot(caseData(), {
      capturedAt: '2026-11-03T00:00:00.000Z',
      cryptoProvider,
    });
    const later = await createTraceSnapshot(caseData({
      nodes: [{ id: 'source', label: 'Source (reviewed)' }, { id: 'receiver', label: 'Receiver' }, { id: 'new-hop', label: 'New hop' }],
      links: [
        { source: 'source', target: 'receiver', value: '1 BTC', txid: 'tx-one' },
        { source: 'receiver', target: 'new-hop', value: '0.5 BTC', txid: 'tx-two' },
      ],
      traceMeta: {
        warnings: ['New provider warning'],
        stats: { prunedBranches: [], omittedNodeCount: 0, omittedLinkCount: 0 },
        collection: { sourceManifest: [{ txid: 'tx-one' }, { txid: 'tx-two' }] },
        addressHistoryScan: { complete: false, pagesScanned: 2, transactionsScanned: 50 },
      },
    }), {
      capturedAt: '2026-11-04T00:00:00.000Z',
      cryptoProvider,
    });

    expect((await verifyTraceSnapshot(earlier, { cryptoProvider })).valid).toBe(true);
    expect((await verifyTraceSnapshot(later, { cryptoProvider })).valid).toBe(true);
    const result = compareTraceSnapshots(earlier, later);
    expect(result.nodes).toMatchObject({ added: ['new-hop'], changed: ['source'] });
    expect(result.links.added).toHaveLength(1);
    expect(result.links.removed).toHaveLength(0);
    expect(result.transactionReferences.added).toEqual(['tx-two']);
    expect(result.warnings.added).toEqual(['New provider warning']);
    expect(result.coverage.earlier.prunedBranches).toBe(1);
    expect(result.coverage.later.addressHistoryComplete).toBe(false);
  });

  it('refuses to compare different cases', async () => {
    const first = await createTraceSnapshot(caseData(), { cryptoProvider });
    const second = await createTraceSnapshot(caseData({ id: 'another-case' }), { cryptoProvider });
    expect(() => compareTraceSnapshots(first, second)).toThrow('same case');
  });
});
