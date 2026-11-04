import { describe, expect, it } from 'vitest';
import { recordJointTransactionAcrossCases } from './jointTransactionLinks';
import { correlateCases } from './syndicateAnalysis';

const INPUT_A = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const INPUT_B = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';
const TXID = 'a'.repeat(64);

function makeCase(id, address) {
  return { id, nodes: [{ id: `${id}-input`, details: { address } }], links: [] };
}

describe('recordJointTransactionAcrossCases', () => {
  it('records a co-spend reference only on the saved cases containing its inputs', () => {
    const cases = [makeCase('case-a', INPUT_A), makeCase('case-b', INPUT_B), makeCase('case-c', 'bc1q7w5pxj2lznq48as923kd8mzklaq02947alkwsj')];
    const result = recordJointTransactionAcrossCases(cases, { txid: TXID, inputAddresses: [INPUT_A, INPUT_B] });

    expect(result.linkedCaseIds).toEqual(['case-a', 'case-b']);
    expect(result.cases[0].jointTransactionEvidence[0]).toMatchObject({
      txid: TXID,
      inputAddresses: [INPUT_A],
      method: 'common-input co-spend',
    });
    expect(result.cases[1].jointTransactionEvidence[0].inputAddresses).toEqual([INPUT_B]);
    expect(result.cases[2]).toBe(cases[2]);
    const correlation = correlateCases(result.cases);
    expect(correlation.linkedCaseCount).toBe(2);
    expect(correlation.pairs[0]).toMatchObject({
      sharedCount: 0,
      sharedTransactionCount: 1,
      verdict: 'WEAK_OVERLAP',
    });
  });

  it('updates rather than duplicates a previously recorded transaction', () => {
    const cases = [
      { ...makeCase('case-a', INPUT_A), jointTransactionEvidence: [{ txid: TXID, inputAddresses: [INPUT_A], recordedAt: '2026-01-01T00:00:00.000Z' }] },
      makeCase('case-b', INPUT_B),
    ];
    const result = recordJointTransactionAcrossCases(cases, { txid: TXID.toUpperCase(), inputAddresses: [INPUT_A, INPUT_B] });

    expect(result.cases[0].jointTransactionEvidence).toHaveLength(1);
    expect(result.cases[0].jointTransactionEvidence[0].recordedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('does not change cases when matching inputs are not represented in two cases', () => {
    const cases = [makeCase('case-a', INPUT_A), makeCase('case-b', INPUT_A)];
    const result = recordJointTransactionAcrossCases(cases, { txid: TXID, inputAddresses: [INPUT_A, INPUT_B] });

    expect(result.linkedCaseIds).toEqual([]);
    expect(result.reason).toMatch(/distinct transaction input addresses/);
    expect(result.cases).toBe(cases);
  });

  it('rejects invalid transaction references', () => {
    expect(() => recordJointTransactionAcrossCases([], { txid: 'bad', inputAddresses: [] }))
      .toThrow('valid transaction ID');
  });
});
