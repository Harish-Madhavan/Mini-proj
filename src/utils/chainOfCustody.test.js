import { describe, it, expect } from 'vitest';
import { buildChainOfCustody, verifyChainOfCustody, chainDigest } from './chainOfCustody';

const caseObj = {
  id: 'case-x',
  nodes: [
    { id: 's', label: 'Origin', type: 'suspect', details: { address: 'addr_s', blockTime: 1700000000 } },
    { id: 'h', label: 'Hop', type: 'hop', details: { address: 'addr_h', blockTime: 1700003600 } },
    { id: 'r', label: 'Receiver', type: 'receiver', details: { address: 'addr_r', blockTime: 1700007200 } },
  ],
  links: [
    { source: 's', target: 'h', value: '1.0000 BTC' },
    { source: 'h', target: 'r', value: '0.9900 BTC' },
  ],
};

describe('chainOfCustody', () => {
  it('builds an ordered, hash-chained timeline', () => {
    const chain = buildChainOfCustody(caseObj);
    expect(chain.eventCount).toBe(2);
    expect(chain.events[0].seq).toBe(1);
    expect(chain.events[1].prevHash).toBe(chain.events[0].eventHash);
    expect(chain.terminalHash).toBe(chain.events[1].eventHash);
    expect(chain.gaps.length).toBe(0);
  });

  it('verifies an intact chain', () => {
    const chain = buildChainOfCustody(caseObj);
    const v = verifyChainOfCustody(chain.events);
    expect(v.valid).toBe(true);
    expect(v.checkedEvents).toBe(2);
  });

  it('detects tampering and reordering', () => {
    const chain = buildChainOfCustody(caseObj);
    const edited = chain.events.map(e => ({ ...e }));
    edited[1] = { ...edited[1], amountBtc: 999 };
    expect(verifyChainOfCustody(edited).valid).toBe(false);
    expect(verifyChainOfCustody(edited).brokenAtSeq).toBe(2);

    const reordered = [chain.events[1], chain.events[0]];
    expect(verifyChainOfCustody(reordered).valid).toBe(false);
  });

  it('flags value discontinuities and unanchored hops', () => {
    const branched = {
      ...caseObj,
      nodes: caseObj.nodes.map(n => ({ ...n, details: { ...n.details, blockTime: undefined } })),
      links: [
        { source: 's', target: 'h', value: '10.0000 BTC' },
        { source: 'h', target: 'r', value: '1.0000 BTC' },
      ],
    };
    const chain = buildChainOfCustody(branched);
    expect(chain.gaps.some(g => g.kind === 'VALUE_DISCONTINUITY')).toBe(true);
  });

  it('produces stable digests and handles empty input', () => {
    expect(chainDigest('aegis')).toBe(chainDigest('aegis'));
    expect(chainDigest('aegis')).not.toBe(chainDigest('aegis2'));
    expect(buildChainOfCustody(null).terminalHash).toBeNull();
    expect(verifyChainOfCustody([]).valid).toBe(false);
  });
});
