import { describe, it, expect } from 'vitest';
import {
  detectStructuring,
  detectStructuringTx,
  scanCaseStructuring,
  bandByValueProximity,
  STRUCTURING_CONFIG,
} from './structuringAnalysis';

describe('structuringAnalysis', () => {
  it('flags batches of similar sub-cap payments', () => {
    const outs = [10000000, 10100000, 9900000, 10050000, 200000000]; // 4x ~0.1 BTC + change
    const r = detectStructuring(outs);
    expect(r.isStructuring).toBe(true);
    expect(r.maxBandSize).toBe(4);
    expect(r.confidence).toBeGreaterThanOrEqual(50);
  });

  it('ignores CoinJoin-style identical outputs from multi-party inputs', () => {
    const outs = [10000000, 10000000, 10000000, 500000];
    expect(detectStructuring(outs, true).isStructuring).toBe(false);
    // ...but the same shape from a single wallet is smurfing
    expect(detectStructuring(outs, false).isStructuring).toBe(true);
  });

  it('rejects over-cap and dust-only outputs', () => {
    expect(detectStructuring([100000000, 100000000, 100000000]).isStructuring).toBe(false);
    expect(detectStructuring([100, 200, 300]).isStructuring).toBe(false);
    expect(detectStructuring([5000000, 6000000]).isStructuring).toBe(false);
  });

  it('detects structuring directly from raw txs', () => {
    const tx = {
      vin: [{ prevout: { value: 100000000 } }],
      vout: [10000000, 10000000, 10000000, 10000000, 59000000].map(value => ({ value })),
    };
    const r = detectStructuringTx(tx);
    expect(r.isStructuring).toBe(true);
    expect(r.maxBandSize).toBe(4);
  });

  it('scans case graphs per funding source', () => {
    const nodes = [
      { id: 'src', type: 'hop' },
      { id: 'a', type: 'receiver' },
      { id: 'b', type: 'receiver' },
      { id: 'c', type: 'receiver' },
    ];
    const links = [
      { source: 'src', target: 'a', value: '0.1000 BTC' },
      { source: 'src', target: 'b', value: '0.1010 BTC' },
      { source: 'src', target: 'c', value: '0.0990 BTC' },
    ];
    const r = scanCaseStructuring(nodes, links);
    expect(r.detected).toBe(true);
    expect(r.sources[0].sourceId).toBe('src');
  });

  it('bands values within tolerance', () => {
    const bands = bandByValueProximity([100, 102, 104, 500]);
    expect(bands.length).toBe(2);
    expect(bands[0].members.length).toBe(3);
    expect(STRUCTURING_CONFIG.MIN_BAND_SIZE).toBe(3);
  });
});
