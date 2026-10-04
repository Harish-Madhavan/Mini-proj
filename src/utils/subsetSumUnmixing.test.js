import { describe, it, expect } from 'vitest';
import { solveCoinJoinSubsetSum } from './clusteringAlgorithms';

describe('CoinJoin Knapsack / Subset-Sum Unmixing Solver', () => {
  it('correctly de-anonymizes a 2-party CoinJoin transaction', () => {
    // Party 1: Input of 12,000,000 sats -> Mix: 10,000,000 sats, Change: 1,990,000 sats, Fee: 10,000 sats
    // Party 2: Inputs of 6,000,000 and 7,000,000 sats (13M sats) -> Mix: 10,000,000 sats, Change: 2,980,000 sats, Fee: 20,000 sats
    const inputs = [
      { id: 'in_alice_1', address: 'bc1qalice', valueSats: 12000000 },
      { id: 'in_bob_1', address: 'bc1qbob1', valueSats: 6000000 },
      { id: 'in_bob_2', address: 'bc1qbob2', valueSats: 7000000 }
    ];

    const outputs = [
      { id: 'out_mix_1', address: 'bc1qmix1', valueSats: 10000000 },
      { id: 'out_mix_2', address: 'bc1qmix2', valueSats: 10000000 },
      { id: 'out_change_alice', address: 'bc1qalice_change', valueSats: 1990000 },
      { id: 'out_change_bob', address: 'bc1qbob_change', valueSats: 2980000 }
    ];

    const result = solveCoinJoinSubsetSum({ inputs, outputs });

    expect(result.isCoinJoin).toBe(true);
    expect(result.isSolvable).toBe(true);
    expect(result.mixDenominationSats).toBe(10000000);
    expect(result.mixOutputCount).toBe(2);
    expect(result.participantCount).toBe(2);
    expect(result.confidence).toBeGreaterThanOrEqual(90);

    // Verify participant 1 (Alice) linked correctly
    const alicePart = result.partitions.find(p => p.inputIds.includes('in_alice_1'));
    expect(alicePart).toBeDefined();
    expect(alicePart.inputIds).toEqual(['in_alice_1']);
    expect(alicePart.changeOutput.id).toBe('out_change_alice');
    expect(alicePart.estimatedFeeSats).toBe(10000);

    // Verify participant 2 (Bob) linked correctly with co-spent inputs
    const bobPart = result.partitions.find(p => p.inputIds.includes('in_bob_1'));
    expect(bobPart).toBeDefined();
    expect(bobPart.inputIds.sort()).toEqual(['in_bob_1', 'in_bob_2'].sort());
    expect(bobPart.changeOutput.id).toBe('out_change_bob');
    expect(bobPart.estimatedFeeSats).toBe(20000);
  });

  it('handles CoinJoin participant without change output (exact mix payment)', () => {
    // Party 1: Input 10,015,000 sats -> Mix 10,000,000 sats, No Change, Fee 15,000 sats
    // Party 2: Input 15,000,000 sats -> Mix 10,000,000 sats, Change 4,980,000 sats, Fee 20,000 sats
    const inputs = [
      { id: 'in_1', valueSats: 10015000 },
      { id: 'in_2', valueSats: 15000000 }
    ];

    const outputs = [
      { id: 'out_mix_1', valueSats: 10000000 },
      { id: 'out_mix_2', valueSats: 10000000 },
      { id: 'out_change_2', valueSats: 4980000 }
    ];

    const result = solveCoinJoinSubsetSum({ inputs, outputs });
    expect(result.isSolvable).toBe(true);
    expect(result.partitions.length).toBe(2);

    const noChangePart = result.partitions.find(p => p.changeOutput === null);
    expect(noChangePart).toBeDefined();
    expect(noChangePart.totalInputSats).toBe(10015000);
    expect(noChangePart.estimatedFeeSats).toBe(15000);
  });

  it('rejects transactions without equal-denomination mix outputs', () => {
    const inputs = [{ valueSats: 5000000 }, { valueSats: 4000000 }];
    const outputs = [{ valueSats: 3000000 }, { valueSats: 5900000 }];

    const result = solveCoinJoinSubsetSum({ inputs, outputs });
    expect(result.isCoinJoin).toBe(false);
    expect(result.isSolvable).toBe(false);
  });

  it('gracefully handles insufficient inputs or outputs', () => {
    expect(solveCoinJoinSubsetSum({ inputs: [1000], outputs: [1000] }).isCoinJoin).toBe(false);
    expect(solveCoinJoinSubsetSum({ inputs: [], outputs: [] }).isCoinJoin).toBe(false);
  });
});
