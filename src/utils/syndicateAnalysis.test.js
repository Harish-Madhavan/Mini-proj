import { describe, it, expect } from 'vitest';
import { correlateCases, extractCaseAddresses, isJoinableAddress } from './syndicateAnalysis';

const HOP = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const HOP2 = 'bc1q7w5pxj2lznq48as923kd8mzklaq02947alkwsj';
const DEP = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';

const mkCase = (id, addrs) => ({
  id,
  nodes: addrs.map((address, i) => ({
    id: `${id}_n${i}`,
    type: i === addrs.length - 1 ? 'receiver' : 'hop',
    details: { address },
  })),
  links: [],
});

describe('syndicateAnalysis', () => {
  it('rejects non-joinable keys', () => {
    expect(isJoinableAddress('1_P2PK_ab12...cd34')).toBe(false);
    expect(isJoinableAddress('a'.repeat(64))).toBe(false);
    expect(isJoinableAddress('tx_abc123')).toBe(false);
    expect(isJoinableAddress(HOP)).toBe(true);
  });

  it('links cases sharing a transit hop', () => {
    const res = correlateCases([mkCase('case-a', [HOP, DEP]), mkCase('case-b', [HOP2, HOP])]);
    expect(res.pairs.length).toBe(1);
    expect(res.pairs[0].sharedCount).toBe(1);
    expect(res.linkedCaseCount).toBe(2);
    expect(res.components.length).toBe(1);
    expect(res.components[0].syndicateId).toBe('SYN-01');
  });

  it('upgrades shared endpoints to SAME_OPERATOR_LIKELY', () => {
    const res = correlateCases([mkCase('case-a', [HOP, DEP]), mkCase('case-b', [HOP2, HOP, DEP])]);
    const pair = res.pairs[0];
    expect(pair.sharedCount).toBe(2);
    expect(pair.endpointShares).toBeGreaterThanOrEqual(1);
    expect(pair.linkScore).toBeGreaterThanOrEqual(55);
    expect(pair.verdict).toBe('SAME_OPERATOR_LIKELY');
  });

  it('returns empty linkage for disjoint cases', () => {
    const res = correlateCases([mkCase('case-a', [HOP]), mkCase('case-b', [HOP2])]);
    expect(res.pairs.length).toBe(0);
    expect(res.components.length).toBe(0);
    expect(res.linkedCaseCount).toBe(0);
    expect(res.caseCount).toBe(2);
  });

  it('links cases through recorded co-spend evidence without treating it as ownership proof', () => {
    const txid = 'a'.repeat(64);
    const caseA = { ...mkCase('case-a', [HOP]), jointTransactionEvidence: [{ txid, inputAddresses: [HOP] }] };
    const caseB = { ...mkCase('case-b', [DEP]), jointTransactionEvidence: [{ txid, inputAddresses: [DEP] }] };
    const res = correlateCases([caseA, caseB]);

    expect(res.pairs).toHaveLength(1);
    expect(res.pairs[0]).toMatchObject({
      sharedCount: 0,
      sharedTransactionCount: 1,
      verdict: 'WEAK_OVERLAP',
    });
    expect(res.pairs[0].sharedTransactions[0]).toMatchObject({
      txid,
      inputAddressesA: [HOP],
      inputAddressesB: [DEP],
    });
    expect(res.linkedCaseCount).toBe(2);
    expect(res.components).toHaveLength(1);
  });

  it('does not link a transaction when both cases only contain the same input address', () => {
    const txid = 'b'.repeat(64);
    const sharedEvidence = [{ txid, inputAddresses: [HOP] }];
    const res = correlateCases([
      { ...mkCase('case-a', [HOP]), jointTransactionEvidence: sharedEvidence },
      { ...mkCase('case-b', [HOP]), jointTransactionEvidence: sharedEvidence },
    ]);

    expect(res.pairs[0].sharedTransactionCount).toBe(0);
    expect(res.pairs[0].sharedCount).toBe(1);
  });

  it('shows investigator-recorded associations separately from chain evidence', () => {
    const association = {
      associationId: 'manual-1',
      caseAId: 'case-a',
      caseBId: 'case-b',
      transactionIds: ['c'.repeat(64)],
      rationale: 'Reviewed together by investigator.',
      warning: 'Not independently verified.',
    };
    const cases = [
      { ...mkCase('case-a', [HOP]), manualCaseAssociations: [association] },
      { ...mkCase('case-b', [DEP]), manualCaseAssociations: [association] },
    ];
    const result = correlateCases(cases);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]).toMatchObject({
      sharedCount: 0,
      sharedTransactionCount: 0,
      manualAssociationCount: 1,
      linkScore: 0,
      verdict: 'INVESTIGATOR_ASSOCIATED',
    });
    expect(result.pairs[0].manualAssociations[0].rationale).toBe(association.rationale);
    expect(result.components).toHaveLength(1);
  });

  it('extracts address footprints with roles', () => {
    const fp = extractCaseAddresses(mkCase('c', [HOP, DEP]));
    expect(fp.has(HOP)).toBe(true);
    expect(fp.get(DEP).roles.has('receiver')).toBe(true);
  });
});
