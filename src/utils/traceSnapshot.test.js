import { describe, expect, it, vi } from 'vitest';
import { createTraceSnapshot } from './traceSnapshot';
import { hashEvidencePayload } from './evidenceIntegrity';

vi.mock('./evidenceIntegrity', () => ({
  hashEvidencePayload: vi.fn(async () => 'SHA256:TEST'),
}));

describe('createTraceSnapshot', () => {
  it('exports a point-in-time copy with trace provenance and digest scope', async () => {
    const caseData = {
      id: 'case-1',
      nodes: [{ id: 'tx_a' }],
      links: [],
      traceMeta: {
        warnings: ['Branch limit reached'],
        collection: { requestedDepth: 2, sourceManifest: [{ txid: 'abc' }] },
      },
    };
    const snapshot = await createTraceSnapshot(caseData, { capturedAt: '2026-11-04T00:00:00.000Z' });
    caseData.nodes[0].id = 'changed-after-snapshot';

    expect(snapshot).toMatchObject({
      format: 'aegistrace-trace-snapshot',
      version: 1,
      capturedAt: '2026-11-04T00:00:00.000Z',
      caseData: {
        id: 'case-1',
        nodes: [{ id: 'tx_a' }],
        traceMeta: { warnings: ['Branch limit reached'] },
      },
      integrity: {
        algorithm: 'SHA-256',
        digest: 'SHA256:TEST',
      },
    });
    expect(snapshot.disclaimer).toContain('does not authenticate data sources');
    expect(hashEvidencePayload).toHaveBeenCalledWith(expect.objectContaining({
      format: 'aegistrace-trace-snapshot',
      version: 1,
      capturedAt: '2026-11-04T00:00:00.000Z',
      caseData: snapshot.caseData,
    }), globalThis.crypto);
  });

  it('rejects invalid case data and invalid capture dates', async () => {
    await expect(createTraceSnapshot(null)).rejects.toThrow('case with an ID, graph nodes, and links');
    await expect(createTraceSnapshot({ nodes: [], links: [] })).rejects.toThrow('case with an ID');
    await expect(createTraceSnapshot({ id: 'case-1', nodes: [], links: [] }, { capturedAt: 'not-a-date' }))
      .rejects.toThrow('valid date string');
  });
});
