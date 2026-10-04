import { describe, it, expect } from 'vitest';
import {
  calculateTaintMap,
  formatTaintPct,
  taintTier,
  calculateEdgeTaintMap,
  generateTaintLedger,
  compareTaintModels,
  auditTaintConservation
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

  it('averages taint across merged inputs (haircut fan-in)', () => {
    const mergeNodes = [
      { id: 'a', type: 'suspect', balance: '0.5 BTC' },
      { id: 'x', type: 'hop', balance: '0.5 BTC' },
      { id: 'v', type: 'hop', balance: '1.0 BTC' }
    ];
    const mergeLinks = [
      { source: 'a', target: 'v', value: '0.5 BTC' },
      { source: 'x', target: 'v', value: '0.5 BTC' }
    ];
    const map = calculateTaintMap(mergeNodes, mergeLinks, ['a'], 'proportionate');
    expect(map.get('v')).toBeCloseTo(0.5, 5);
  });

  it('fills outputs in link order under FIFO with conserved holdings (mixed source)', () => {
    const fifoNodes = [
      { id: 's1', type: 'suspect', balance: '0.5 BTC' },
      { id: 's2', type: 'hop', balance: '0.5 BTC' },
      { id: 'm', type: 'hop', balance: '1.0 BTC' },
      { id: 'c', type: 'receiver', balance: '1.0 BTC' },
      { id: 'd', type: 'hop', balance: '1.0 BTC' }
    ];
    const fifoLinks = [
      { source: 's1', target: 'm', value: '0.5 BTC' },
      { source: 's2', target: 'm', value: '0.5 BTC' },
      { source: 'm', target: 'c', value: '1.0 BTC' },
      { source: 'm', target: 'd', value: '1.0 BTC' }
    ];
    const map = calculateTaintMap(fifoNodes, fifoLinks, ['s1'], 'fifo');
    expect(map.get('m')).toBeCloseTo(0.5, 5);
    // m holds 0.5 tainted sats (1.0 inflow × 50%); first 1.0-BTC output gets
    // those 0.5 sats → 50% tainted, second gets 0. No taint is minted.
    expect(map.get('c')).toBeCloseTo(0.5, 5);
    expect(map.get('d')).toBe(0);
  });

  it('leaves zero-value data carriers untainted', () => {
    const map = calculateTaintMap(
      [
        { id: 'a', type: 'suspect', balance: '1.0 BTC' },
        { id: 'op', type: 'hop', balance: '0 BTC' },
        { id: 'b', type: 'hop', balance: '1.0 BTC' }
      ],
      [
        { source: 'a', target: 'b', value: '1.0 BTC' },
        { source: 'a', target: 'op', value: '0 BTC Data' }
      ],
      ['a'],
      'proportionate'
    );
    expect(map.get('op')).toBe(0);
    expect(map.get('b')).toBe(1);
  });

  it('produces tier labels', () => {
    expect(taintTier(0.9).label).toBe('High');
    expect(taintTier(0.5).label).toBe('Medium');
    expect(taintTier(0.1).label).toBe('Low');
    expect(taintTier(0).label).toBe('Clean');
  });

  it('derives edge taint from the sender, not the receiver (no decay)', () => {
    const mergeNodes = [
      { id: 'a', type: 'suspect', balance: '0.5 BTC' },
      { id: 'x', type: 'hop', balance: '0.5 BTC' },
      { id: 'v', type: 'hop', balance: '1.0 BTC' }
    ];
    const mergeLinks = [
      { source: 'a', target: 'v', value: '0.5 BTC' },
      { source: 'x', target: 'v', value: '0.5 BTC' }
    ];
    const nodeMap = calculateTaintMap(mergeNodes, mergeLinks, ['a'], 'proportionate');
    expect(nodeMap.get('v')).toBeCloseTo(0.5, 5);
    const edgeMap = calculateEdgeTaintMap(mergeNodes, mergeLinks, nodeMap, 'proportionate');
    // Tainted input carries 100% (sender is fully tainted); clean input 0%.
    // The old max(tgt, src*0.85) formula gave 85% / 50% here.
    expect(edgeMap.get('a->v').taint).toBeCloseTo(1, 5);
    expect(edgeMap.get('a->v').taintedSats).toBe(50000000);
    expect(edgeMap.get('x->v').taint).toBe(0);
    expect(edgeMap.get('x->v').taintedSats).toBe(0);
  });

  it('allocates FIFO edge shares from conserved holdings in link order', () => {
    const fifoNodes = [
      { id: 's1', type: 'suspect', balance: '0.5 BTC' },
      { id: 's2', type: 'hop', balance: '0.5 BTC' },
      { id: 'm', type: 'hop', balance: '1.0 BTC' },
      { id: 'c', type: 'receiver', balance: '1.0 BTC' },
      { id: 'd', type: 'hop', balance: '1.0 BTC' }
    ];
    const fifoLinks = [
      { source: 's1', target: 'm', value: '0.5 BTC' },
      { source: 's2', target: 'm', value: '0.5 BTC' },
      { source: 'm', target: 'c', value: '1.0 BTC' },
      { source: 'm', target: 'd', value: '1.0 BTC' }
    ];
    const nodeMap = calculateTaintMap(fifoNodes, fifoLinks, ['s1'], 'fifo');
    const edgeMap = calculateEdgeTaintMap(fifoNodes, fifoLinks, nodeMap, 'fifo');
    expect(edgeMap.get('m->c').taintedSats).toBe(50000000);
    expect(edgeMap.get('m->c').taint).toBeCloseTo(0.5, 5);
    expect(edgeMap.get('m->d').taintedSats).toBe(0);
  });

  it('reconciles ledger inflow taint with node taint', () => {
    const nodeMap = calculateTaintMap(nodes, links, ['a']);
    const ledger = generateTaintLedger(nodes, links, nodeMap);
    const rowB = ledger.find(r => r.nodeId === 'b');
    expect(rowB.inflowSats).toBe(100000000);
    expect(rowB.taintedInflowSats).toBe(Math.round(100000000 * nodeMap.get('b')));
    expect(rowB.cleanSats).toBeGreaterThanOrEqual(0);
  });

  it('compares all three models and localizes disagreement (mixed-source fan-out)', () => {
    const mixedNodes = [
      { id: 's1', type: 'suspect', balance: '0.5 BTC' },
      { id: 's2', type: 'hop', balance: '0.5 BTC' },
      { id: 'm', type: 'hop', balance: '1.0 BTC' },
      { id: 'c', type: 'receiver', balance: '0.5 BTC' },
      { id: 'd', type: 'receiver', balance: '0.5 BTC' }
    ];
    const mixedLinks = [
      { source: 's1', target: 'm', value: '0.5 BTC' },
      { source: 's2', target: 'm', value: '0.5 BTC' },
      { source: 'm', target: 'c', value: '0.5 BTC' },
      { source: 'm', target: 'd', value: '0.5 BTC' }
    ];
    const cmp = compareTaintModels(mixedNodes, mixedLinks, ['s1']);
    // Poison sees contact everywhere; haircut dilutes to 50%; FIFO fills
    // the first output whole (100%) and starves the second.
    expect(cmp.maps.poison.get('d')).toBe(1.0);
    expect(cmp.maps.proportionate.get('m')).toBeCloseTo(0.5, 5);
    expect(cmp.maps.fifo.get('c')).toBeCloseTo(1.0, 5);
    expect(cmp.maps.fifo.get('d')).toBe(0);
    const top = cmp.disagreement[0];
    expect(top.spread).toBeGreaterThan(0.4);
    expect(cmp.maxSpread).toBeCloseTo(top.spread, 5);
    // Terminal tainted sats diverge by model — the filing choice matters.
    expect(cmp.terminalTaintedSats.poison).toBe(100000000);
    expect(cmp.terminalTaintedSats.proportionate).toBe(50000000);
    expect(cmp.terminalTaintedSats.fifo).toBe(50000000);
  });

  it('passes conservation audit on engine output, flags tampered maps', () => {
    const map = calculateTaintMap(nodes, links, ['a'], 'fifo');
    const clean = auditTaintConservation(nodes, links, map, 'fifo', null, ['a']);
    expect(clean.passed).toBe(true);
    expect(clean.violations).toEqual([]);

    const tampered = new Map(map);
    tampered.set('c', 1.5);
    const bad = auditTaintConservation(nodes, links, tampered, 'proportionate');
    expect(bad.passed).toBe(false);
    expect(bad.violations.some(v => v.nodeId === 'c' && v.check === 'bounds')).toBe(true);

    const unpinned = new Map(map);
    unpinned.set('a', 0.2);
    const unpinnedAudit = auditTaintConservation(nodes, links, unpinned, 'proportionate');
    expect(unpinnedAudit.violations.some(v => v.nodeId === 'a' && v.check === 'seed-pinned')).toBe(true);
  });
});
