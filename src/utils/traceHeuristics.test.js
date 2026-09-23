import { describe, it, expect } from 'vitest';
import {
  scoreOutputHeuristics,
  computeTraceConfidence,
  isDustOutput,
  getUtxoAgeInfo,
  exchangeDepositConfidence,
} from './traceHeuristics';

describe('traceHeuristics helpers', () => {
  it('aggregates trace confidence with ambiguity and depth penalties', () => {
    expect(computeTraceConfidence([])).toEqual({ confidence: 0.5, level: 'LOW', ambiguousCount: 0 });
    const single = computeTraceConfidence([{ score: 3, confidence: 0.9 }]);
    expect(single.confidence).toBeCloseTo(0.85, 2);
    expect(single.level).toBe('HIGH');
    expect(single.ambiguousCount).toBe(0);

    const murky = computeTraceConfidence(Array.from({ length: 5 }, () => ({ score: 0.2, confidence: 0.6 })));
    expect(murky.level).toBe('LOW');
    expect(murky.ambiguousCount).toBe(5);
    expect(murky.confidence).toBeCloseTo(0.17, 2);

    // Long all-ambiguous chains bottom out at the floor, never negative.
    const long = computeTraceConfidence(Array.from({ length: 20 }, () => ({ score: 0.1, confidence: 0.6 })));
    expect(long.confidence).toBeGreaterThanOrEqual(0.1);
  });

  it('bounds dust at the threshold edges', () => {
    expect(isDustOutput(0)).toBe(false);
    expect(isDustOutput(1)).toBe(true);
    expect(isDustOutput(545)).toBe(true);
    expect(isDustOutput(546)).toBe(false);
    expect(isDustOutput(100000)).toBe(false);
    expect(isDustOutput(NaN)).toBe(false);
    expect(isDustOutput(-5)).toBe(false);
  });

  it('scores custodial script types above self-custody formats', () => {
    expect(exchangeDepositConfidence('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'p2sh', { spent: true })).toBeCloseTo(0.35, 5);
    expect(exchangeDepositConfidence('bc1p0xlxue26wmcc5qcu2v2h2ygq2hld0007z7z42q', 'v1_p2tr', { spent: true })).toBeCloseTo(0.4, 5);
    expect(exchangeDepositConfidence('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 'v0_p2wpkh', { spent: true })).toBe(0);
    expect(exchangeDepositConfidence(null, 'p2pkh', null)).toBe(0);
    expect(exchangeDepositConfidence('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'p2sh', { spent: false })).toBeCloseTo(0.5, 5);
  });

  it('dates UTXO age from block time with an injectable clock', () => {
    expect(getUtxoAgeInfo({})).toBeNull();
    expect(getUtxoAgeInfo({ status: { confirmed: false } })).toBeNull();
    const info = getUtxoAgeInfo(
      { status: { block_height: 57043, block_time: 1274552191 } },
      Date.UTC(2026, 0, 1)
    );
    expect(info.days).toBe(5702);
    expect(info.label).toContain('y');
  });

  it('keeps the scorer total consistent with its breakdown parts', () => {
    const tx = {
      fee: 2000, vsize: 250, weight: 1000,
      vin: [{ prevout: { scriptpubkey_address: 'bc1qsrc', scriptpubkey_type: 'v0_p2wpkh', value: 5000000 } }],
      vout: [
        { scriptpubkey_address: 'bc1qa', scriptpubkey_type: 'v0_p2wpkh', value: 2000000 },
        { scriptpubkey_address: 'bc1qb', scriptpubkey_type: 'v0_p2wpkh', value: 2998000 },
      ],
      status: { confirmed: true, block_height: 800000, block_time: 1700000000 },
    };
    const r = scoreOutputHeuristics({
      tx, outputIndex: 0,
      inputScriptTypes: ['Native SegWit'],
      outspends: [{ spent: true, status: { block_height: 800500 } }, { spent: false }],
      seenAddresses: new Set(),
    });
    const weights = { scriptScore: 0.8, reuseScore: 0.72, roundnessScore: 0.72, positionScore: 0.48, spentScore: 0.72, fingerprintScore: 0.32, feeScore: 0.24, identityScore: 0.72, chainReuseScore: 0.72 };
    const recomputed = Object.entries(weights).reduce((s, [k, w]) => s + r.breakdown[k] * w, 0);
    expect(r.score).toBeCloseTo(parseFloat(recomputed.toFixed(2)), 2);
    expect(r.breakdown.weightedScore).toBe(r.score);
  });
});
