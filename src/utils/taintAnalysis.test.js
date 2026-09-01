import { describe, it, expect } from 'vitest';
import { calculateTaintMap, formatTaintPct, taintTier } from './taintAnalysis';

describe('taintAnalysis', () => {
  it('propagates 100% taint from suspect to receiver via linear chain', () => {
    const nodes = [{ id: 'a', type: 'suspect' }, { id: 'b', type: 'hop' }, { id: 'c', type: 'receiver' }];
    const links = [{ source: 'a', target: 'b', value: '1.0 BTC' }, { source: 'b', target: 'c', value: '1.0 BTC' }];
    const map = calculateTaintMap(nodes, links, ['a']);
    expect(map.get('a')).toBeCloseTo(1);
    expect(map.get('c')).toBeGreaterThan(0.7);
    expect(formatTaintPct(map.get('c'))).toMatch(/%/);
  });
  it('produces tier labels', () => {
    expect(taintTier(0.9).label).toBe('HIGH TAINT');
    expect(taintTier(0.1).label).toBe('LOW TAINT');
    expect(taintTier(0).label).toBe('UNTAINTED');
  });
});
