import { describe, it, expect } from 'vitest';
import { 
  DisjointSetUnion, 
  calculateCoinJoinEntropy, 
  computeAddressClusters, 
  detectPeelingChain 
} from './clusteringAlgorithms';

describe('clusteringAlgorithms', () => {
  describe('DisjointSetUnion (DSU)', () => {
    it('initializes disjoint sets and performs union operations', () => {
      const dsu = new DisjointSetUnion();
      dsu.makeSet('addr_a');
      dsu.makeSet('addr_b');
      dsu.makeSet('addr_c');

      expect(dsu.find('addr_a')).not.toBe(dsu.find('addr_b'));

      dsu.union('addr_a', 'addr_b');
      expect(dsu.find('addr_a')).toBe(dsu.find('addr_b'));
      expect(dsu.find('addr_a')).not.toBe(dsu.find('addr_c'));

      dsu.union('addr_b', 'addr_c');
      expect(dsu.find('addr_a')).toBe(dsu.find('addr_c'));

      const clusters = dsu.getClusters();
      expect(clusters.length).toBe(1);
      expect(clusters[0]).toContain('addr_a');
      expect(clusters[0]).toContain('addr_b');
      expect(clusters[0]).toContain('addr_c');
    });

    it('correctly isolates non-connected clusters', () => {
      const dsu = new DisjointSetUnion();
      dsu.union('a', 'b');
      dsu.union('c', 'd');

      const clusters = dsu.getClusters();
      expect(clusters.length).toBe(2);
    });
  });

  describe('calculateCoinJoinEntropy', () => {
    it('calculates higher entropy for equal-split CoinJoin transactions', () => {
      // 5 equal outputs of 0.1 BTC (10,000,000 sats)
      const equalOutputs = [
        { value: 10000000 },
        { value: 10000000 },
        { value: 10000000 },
        { value: 10000000 },
        { value: 10000000 }
      ];

      const result = calculateCoinJoinEntropy(equalOutputs);
      expect(result.anonymityRatio).toBeCloseTo(1.0, 1);
      expect(result.isCoinJoin).toBe(true);
      expect(result.entropy).toBeGreaterThan(2.0);
    });

    it('calculates lower entropy for skewed normal transactions', () => {
      // 1 payment of 0.01 BTC and large change of 5.0 BTC
      const normalOutputs = [
        { value: 1000000 },
        { value: 500000000 }
      ];

      const result = calculateCoinJoinEntropy(normalOutputs);
      expect(result.isCoinJoin).toBe(false);
      expect(result.anonymityRatio).toBeLessThan(0.5);
    });
  });

  describe('computeAddressClusters', () => {
    it('clusters co-spent addresses from transaction history', () => {
      const addresses = ['addr_1', 'addr_2', 'addr_3', 'addr_solo'];
      const mockTxs = [
        {
          txid: 'tx_multispend_1',
          vin: [
            { prevout: { scriptpubkey_address: 'addr_1' } },
            { prevout: { scriptpubkey_address: 'addr_2' } }
          ]
        },
        {
          txid: 'tx_multispend_2',
          vin: [
            { prevout: { scriptpubkey_address: 'addr_2' } },
            { prevout: { scriptpubkey_address: 'addr_3' } }
          ]
        }
      ];

      const analysis = computeAddressClusters(addresses, mockTxs);
      expect(analysis).not.toBeNull();
      expect(analysis.clusterId).toContain('CLUS-BTC-');
      expect(analysis.confidenceScore).toBeGreaterThanOrEqual(80);
      expect(analysis.coSpentTransactions.length).toBe(2);
      expect(analysis.clustersCount).toBe(2); // ['addr_1', 'addr_2', 'addr_3'] and ['addr_solo']
    });
  });

  describe('detectPeelingChain', () => {
    it('identifies classic peeling chain sequences', () => {
      const mockTxs = [
        {
          txid: 'hop1',
          vout: [
            { value: 100000 }, // 10% peel
            { value: 900000 }  // 90% change
          ]
        },
        {
          txid: 'hop2',
          vout: [
            { value: 90000 },  // 10% peel
            { value: 810000 }  // 90% change
          ]
        }
      ];

      const peeling = detectPeelingChain(mockTxs);
      expect(peeling.isPeelingChain).toBe(true);
      expect(peeling.hopCount).toBe(2);
      expect(peeling.confidence).toBeGreaterThanOrEqual(70);
    });

    it('rejects non-peeling structures', () => {
      const normalTxs = [
        {
          txid: 'split',
          vout: [
            { value: 500000 },
            { value: 500000 }
          ]
        }
      ];

      const peeling = detectPeelingChain(normalTxs);
      expect(peeling.isPeelingChain).toBe(false);
    });
  });
});
