import { describe, it, expect } from 'vitest';
import { classifyEndpointActivity } from './bitcoinApi';

const summary = (chain_stats) => ({ chain_stats, mempool_stats: { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 0 } });

describe('classifyEndpointActivity', () => {
  it('flags single-use deposits', () => {
    const r = classifyEndpointActivity(summary({
      funded_txo_count: 1, funded_txo_sum: 1000000000, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 1,
    }));
    expect(r.profile).toBe('SINGLE_USE_DEPOSIT');
    expect(r.balanceSats).toBe(1000000000);
    expect(r.isAggregator).toBe(false);
  });

  it('flags drained pass-throughs, including aggregator drains', () => {
    const r = classifyEndpointActivity(summary({
      funded_txo_count: 8, funded_txo_sum: 900000000, spent_txo_count: 1, spent_txo_sum: 900000000, tx_count: 9,
    }));
    expect(r.profile).toBe('DRAINED_PASS_THROUGH');
    expect(r.balanceSats).toBe(0);
    expect(r.isAggregator).toBe(true);
  });

  it('flags active reused wallets', () => {
    const r = classifyEndpointActivity(summary({
      funded_txo_count: 3, funded_txo_sum: 300000000, spent_txo_count: 2, spent_txo_sum: 100000000, tx_count: 12,
    }));
    expect(r.profile).toBe('ACTIVE_REUSED_WALLET');
    expect(r.balanceSats).toBe(200000000);
  });

  it('flags dormant holders', () => {
    const r = classifyEndpointActivity(summary({
      funded_txo_count: 3, funded_txo_sum: 300000000, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 3,
    }));
    expect(r.profile).toBe('DORMANT_HOLDER');
  });

  it('returns UNPROFILED without chain stats', () => {
    expect(classifyEndpointActivity({}).profile).toBe('UNPROFILED');
    expect(classifyEndpointActivity(null).profile).toBe('UNPROFILED');
  });
});
