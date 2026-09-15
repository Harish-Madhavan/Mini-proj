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

  it('extracts address footprints with roles', () => {
    const fp = extractCaseAddresses(mkCase('c', [HOP, DEP]));
    expect(fp.has(HOP)).toBe(true);
    expect(fp.get(DEP).roles.has('receiver')).toBe(true);
  });
});
