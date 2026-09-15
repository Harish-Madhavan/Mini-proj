import { describe, it, expect } from 'vitest';
import { generateForensicNarrative } from './narrativeGenerator';

const baseCase = {
  id: 'case-nar-01',
  nodes: [
    { id: 's', label: 'Origin', type: 'suspect', balance: '5 BTC', details: { address: 'bc1qsuspect', kycStatus: 'UNREGISTERED' } },
    { id: 'h1', label: 'Hop', type: 'hop', balance: '4.5 BTC', details: { address: 'bc1qhop1', kycStatus: 'UNREGISTERED TRANSIT' } },
    { id: 'r', label: 'End', type: 'receiver', balance: '4.4 BTC', details: { address: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', kycStatus: 'IDENTITY VERIFIED' } },
  ],
  links: [
    { source: 's', target: 'h1', value: '4.5 BTC' },
    { source: 'h1', target: 'r', value: '4.4 BTC' },
  ],
};

describe('narrativeGenerator', () => {
  it('renders headline, summary, findings, and limitations', () => {
    const n = generateForensicNarrative(baseCase);
    expect(n.headline).toBeTruthy();
    expect(n.summary).toContain('case-nar-01');
    expect(n.findings.length).toBeGreaterThan(0);
    expect(n.limitations.length).toBeGreaterThanOrEqual(2);
    expect(n.limitations.join(' ')).toContain('not a person');
    expect(n.urgency).toBeTruthy();
  });

  it('states mixer blindness when CoinJoin is present', () => {
    const mixerCase = {
      ...baseCase,
      nodes: [...baseCase.nodes, { id: 'm', label: 'Mix', type: 'mixer', balance: '1 BTC', details: {} }],
    };
    const n = generateForensicNarrative(mixerCase);
    expect(n.findings.join(' ')).toContain('broken');
    expect(n.limitations.join(' ')).toContain('CoinJoin');
  });

  it('flags low trace confidence as lead-not-fact', () => {
    const lowConf = { ...baseCase, traceMeta: { confidence: 0.3, confidenceLevel: 'LOW' } };
    const n = generateForensicNarrative(lowConf);
    expect(n.limitations.join(' ')).toContain('investigative lead');
  });

  it('returns null for missing cases', () => {
    expect(generateForensicNarrative(null)).toBeNull();
  });
});
