import { describe, it, expect } from 'vitest';
import { 
  calculateTaintMap, 
  formatTaintPct, 
  taintTier, 
  calculateEdgeTaintMap, 
  generateTaintLedger 
} from './taintAnalysis';

describe('taintAnalysis', () => {
  const nodes = [
    { id: 'a', type: 'suspect', balance: '1.0 BTC' },
    { id: 'b', type: 'hop', balance: '1.0 BTC' },
    { id: 'c', type: 'receiver', balance: '0.8 BTC' },
    { id: 'd', type: 'hop', balance: '0.2 BTC' }
  ];
  const links = [
    { source: 'a', target: 'b', value: '1.0 BTC' },
    { source: 'b', target: 'c', value: '0.8 BTC' },
    { source: 'b', target: 'd', value: '0.2 BTC' }
  ];

  it('propagates 100% taint from suspect to receiver via linear chain (proportionate)', () => {
    const map = calculateTaintMap(nodes, links, ['a'], 'proportionate');
    expect(map.get('a')).toBeCloseTo(1);
    expect(map.get('c')).toBeGreaterThan(0.7);
    expect(formatTaintPct(map.get('c'))).toMatch(/%/);
  });

  it('calculates poison model correctly with 100% contagion', () => {
    const poisonMap = calculateTaintMap(nodes, links, ['a'], 'poison');
    expect(poisonMap.get('a')).toBe(1.0);
    expect(poisonMap.get('b')).toBe(1.0);
    expect(poisonMap.get('c')).toBe(1.0);
    expect(poisonMap.get('d')).toBe(1.0);
  });

  it('calculates FIFO model allocating taint chronologically', () => {
    const fifoMap = calculateTaintMap(nodes, links, ['a'], 'fifo');
    expect(fifoMap.get('a')).toBe(1.0);
    expect(fifoMap.get('c')).toBeGreaterThan(0.5);
  });

  it('produces edge taint map with colors and tiers', () => {
    const nodeMap = calculateTaintMap(nodes, links, ['a']);
    const edgeMap = calculateEdgeTaintMap(nodes, links, nodeMap);
    expect(edgeMap.has('a->b')).toBe(true);
    expect(edgeMap.get('a->b').color).toBeDefined();
    expect(edgeMap.get('a->b').totalSats).toBe(100000000);
  });

  it('generates a complete audit ledger table', () => {
    const nodeMap = calculateTaintMap(nodes, links, ['a']);
    const ledger = generateTaintLedger(nodes, links, nodeMap);
    expect(ledger.length).toBe(4);
    expect(ledger[0].taintPct).toBe('100.0%');
    expect(ledger[0].taintedSats).toBe(100000000);
  });

  it('produces tier labels', () => {
    expect(taintTier(0.9).label).toBe('High');
    expect(taintTier(0.5).label).toBe('Medium');
    expect(taintTier(0.1).label).toBe('Low');
    expect(taintTier(0).label).toBe('Clean');
  });
});
