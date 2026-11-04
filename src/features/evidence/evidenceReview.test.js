import { describe, expect, it } from 'vitest';
import { buildEvidenceGapChecklist } from './evidenceReview';

describe('evidence trace coverage gaps', () => {
  it('surfaces pruned branches, partial address history, and trace warnings', () => {
    const gaps = buildEvidenceGapChecklist({
      nodes: [{ id: 'source', type: 'suspect' }],
      links: [],
      traceMeta: {
        stats: { prunedBranches: [{ txid: 'tx-pruned' }], omittedNodeCount: 2, omittedLinkCount: 3 },
        addressHistoryScan: {
          complete: false,
          pagesScanned: 2,
          transactionsScanned: 50,
          incompleteReason: 'Older history was not scanned.',
        },
        warnings: ['Provider failover occurred.'],
      },
    });

    expect(gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'trace-coverage-limits', priority: 'high' }),
      expect.objectContaining({ id: 'partial-address-history', priority: 'high', detail: expect.stringContaining('50 transaction(s)') }),
      expect.objectContaining({ id: 'trace-warnings', detail: expect.stringContaining('Provider failover occurred.') }),
    ]));
  });

  it('does not report coverage gaps for an unpruned complete trace', () => {
    const gaps = buildEvidenceGapChecklist({
      nodes: [{ id: 'source', type: 'suspect' }],
      links: [],
      traceMeta: {
        stats: { prunedBranches: [], omittedNodeCount: 0, omittedLinkCount: 0 },
        addressHistoryScan: { complete: true, pagesScanned: 1, transactionsScanned: 20 },
        warnings: [],
      },
    });
    expect(gaps.map(gap => gap.id)).not.toContain('trace-coverage-limits');
    expect(gaps.map(gap => gap.id)).not.toContain('partial-address-history');
    expect(gaps.map(gap => gap.id)).not.toContain('trace-warnings');
  });
});
