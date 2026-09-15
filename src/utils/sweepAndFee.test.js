import { describe, it, expect } from 'vitest';
import { detectConsolidationSweep, scanCaseSweeps } from './obfuscationForensics';
import { feeFingerprintSimilarity } from './clusteringAlgorithms';

describe('consolidation sweeps', () => {
  const sweepTx = (nInputs, outVal, outType = 'p2sh', outAddr = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy') => ({
    vin: Array(nInputs).fill({ prevout: { value: 25000000, scriptpubkey_address: 'bc1qin' } }),
    vout: [{ value: outVal, scriptpubkey_address: outAddr, scriptpubkey_type: outType }],
  });

  it('flags imminent custodial cash-out sweeps', () => {
    const r = detectConsolidationSweep(sweepTx(6, 149000000));
    expect(r.isSweep).toBe(true);
    expect(r.cashoutUrgency).toBe('IMMINENT');
    expect(r.inputCount).toBe(6);
    expect(r.confidence).toBeGreaterThanOrEqual(70);
  });

  it('marks non-custodial aggregation as WATCH', () => {
    const r = detectConsolidationSweep(sweepTx(5, 124000000, 'v0_p2wpkh', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'));
    expect(r.isSweep).toBe(true);
    expect(r.cashoutUrgency).toBe('WATCH');
  });

  it('rejects small fan-ins and split outputs', () => {
    expect(detectConsolidationSweep(sweepTx(2, 49000000)).isSweep).toBe(false);
    const split = sweepTx(6, 100000000);
    split.vout.push({ value: 49000000, scriptpubkey_address: 'bc1qother', scriptpubkey_type: 'v0_p2wpkh' });
    expect(detectConsolidationSweep(split).isSweep).toBe(false);
    expect(detectConsolidationSweep(null).isSweep).toBe(false);
  });

  it('scans case graphs for sweep nodes', () => {
    const nodes = [
      { id: 'hub', type: 'hop', entityName: 'Aggr', details: { address: 'hub', kycStatus: 'IDENTITY VERIFIED' } },
    ];
    const links = ['a', 'b', 'c', 'd'].map(s => ({ source: s, target: 'hub', value: '1.0 BTC' }));
    links.push({ source: 'hub', target: 'out', value: '3.99 BTC' });
    const r = scanCaseSweeps([...nodes, { id: 'out', type: 'receiver', details: {} }], links);
    expect(r.detected).toBe(true);
    expect(r.sweeps[0].cashoutUrgency).toBe('IMMINENT');
  });
});

describe('fee fingerprints', () => {
  it('matches same-wallet fee habits', () => {
    const a = { fee: 2200, weight: 880, vin: [{}, {}], vout: [{}, {}] };
    const b = { fee: 2400, weight: 900, vin: [{}], vout: [{}] };
    const r = feeFingerprintSimilarity(a, b);
    expect(r.similarity).toBeGreaterThanOrEqual(0.7);
    expect(r.verdict).toBe('SAME_WALLET_LIKELY');
  });

  it('separates distinct fee regimes', () => {
    const a = { fee: 400, weight: 800, vin: [{}], vout: [{}] };
    const b = { fee: 80000, weight: 800, vin: [{}, {}, {}, {}], vout: [{}, {}] };
    const r = feeFingerprintSimilarity(a, b);
    expect(r.verdict).toBe('DISTINCT_WALLETS');
  });

  it('is inconclusive without fee data', () => {
    expect(feeFingerprintSimilarity({}, {}).verdict).toBe('INCONCLUSIVE');
  });
});
