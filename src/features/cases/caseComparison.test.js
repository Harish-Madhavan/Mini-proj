import { describe, expect, it } from 'vitest';
import { compareCases, summarizeCaseForComparison } from './comparisonMetrics';

describe('case comparison summaries', () => {
  it('summarizes graph coverage and review gaps without merging case amounts', () => {
    const summary = summarizeCaseForComparison({
      id: 'case-1',
      title: 'Example',
      traceType: 'LIVE_CHAIN_TRACE',
      riskScore: 64,
      traceMeta: { confidence: 0.8 },
      nodes: [
        { id: 'origin', type: 'suspect' },
        { id: 'endpoint', type: 'receiver', details: { address: 'bc1qendpoint' } }
      ],
      links: [
        { source: 'origin', target: 'endpoint', value: '1 BTC', txid: 'a'.repeat(64), blockHeight: 100 }
      ],
      recoveryLeads: [{ actions: [{ state: 'planned' }, { state: 'completed' }] }]
    });

    expect(summary).toMatchObject({
      id: 'case-1',
      riskScore: 64,
      traceConfidence: 0.8,
      nodeCount: 2,
      flowCount: 1,
      endpointCount: 1,
      endpoints: ['bc1qendpoint'],
      transactionReferenceCount: 1,
      transactionReferenceCoverage: 1,
      recoveryActionCount: 2,
      openRecoveryActionCount: 1
    });
    expect(summary.evidenceGapCount).toBeGreaterThan(0);
    expect(summary.highPriorityGapCount).toBeGreaterThan(0);
    expect(summary).not.toHaveProperty('totalValue');
  });

  it('handles empty and non-array input safely', () => {
    expect(summarizeCaseForComparison(null)).toMatchObject({
      title: 'Untitled case',
      nodeCount: 0,
      flowCount: 0,
      riskScore: null,
      traceConfidence: null,
      transactionReferenceCoverage: 0
    });
    expect(compareCases(null)).toEqual([]);
    expect(compareCases([{ id: 'one' }])).toHaveLength(1);
  });
});
