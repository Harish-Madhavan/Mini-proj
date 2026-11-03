import { describe, expect, it } from 'vitest';
import { isValidCaseShape } from './caseValidation';

describe('case import graph validation', () => {
  const valid = { id: 'case-1', nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b' }] };

  it('accepts a graph with known endpoints', () => {
    expect(isValidCaseShape(valid)).toBe(true);
    expect(isValidCaseShape({ ...valid, links: [{ source: { id: 'a' }, target: { id: 'b' } }] })).toBe(true);
  });

  it('rejects duplicate node ids and dangling link endpoints', () => {
    expect(isValidCaseShape({ ...valid, nodes: [{ id: 'a' }, { id: 'a' }] })).toBe(false);
    expect(isValidCaseShape({ ...valid, links: [{ source: 'a', target: 'missing' }] })).toBe(false);
    expect(isValidCaseShape({ ...valid, nodes: [{ id: 'a' }, null] })).toBe(false);
  });

  it('rejects invalid amounts, unsupported schema versions, and oversized graphs', () => {
    expect(isValidCaseShape({ ...valid, schemaVersion: 2 })).toBe(false);
    expect(isValidCaseShape({ ...valid, riskScore: 101 })).toBe(false);
    expect(isValidCaseShape({
      ...valid,
      links: [{ source: 'a', target: 'b', value: '-1 BTC' }],
    })).toBe(false);
    expect(isValidCaseShape({
      ...valid,
      nodes: Array.from({ length: 5001 }, (_, i) => ({ id: `n${i}` })),
    })).toBe(false);
  });

  it('requires structurally valid identifiers for imported live traces', () => {
    const liveTrace = {
      ...valid,
      status: 'LIVE_TRACE',
      initialTxHash: 'a'.repeat(64),
      nodes: [
        { id: 'a', details: { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' } },
        { id: 'b' },
      ],
    };
    expect(isValidCaseShape(liveTrace)).toBe(true);
    expect(isValidCaseShape({ ...liveTrace, initialTxHash: 'not-a-txid' })).toBe(false);
    expect(isValidCaseShape({
      ...liveTrace,
      nodes: [{ id: 'a', details: { address: 'bc1qgermanpolice98421bkaforfeiture0092187654' } }, { id: 'b' }],
    })).toBe(false);
  });
});
