import { describe, it, expect } from 'vitest';
import {
  verifyValueConservation,
  verifyTemporalCausality,
  verifyHeuristicConsistency,
  verifyBip69Invariance,
  computeMultiModelConcordance,
  auditTraceCorrectness
} from './traceVerification';

describe('traceVerification', () => {
  describe('verifyValueConservation', () => {
    it('passes for balanced transaction hubs with positive miner fee', () => {
      const nodes = [
        { id: 'in_addr1', type: 'suspect', balance: '1.0 BTC' },
        { id: 'tx_root', type: 'hub', balance: '0 BTC' },
        { id: 'out_pay', type: 'receiver', balance: '0.6 BTC' },
        { id: 'out_change', type: 'change', balance: '0.399 BTC' },
      ];
      const links = [
        { source: 'in_addr1', target: 'tx_root', value: '1.0 BTC' },
        { source: 'tx_root', target: 'out_pay', value: '0.6 BTC' },
        { source: 'tx_root', target: 'out_change', value: '0.399 BTC' },
      ];

      const res = verifyValueConservation(nodes, links);
      expect(res.passed).toBe(true);
      expect(res.violations.length).toBe(0);
      expect(res.checkedHubs).toBe(1);
    });

    it('detects value creation violations when outflow exceeds inflow', () => {
      const nodes = [
        { id: 'in_addr1', type: 'suspect', balance: '1.0 BTC' },
        { id: 'tx_root', type: 'hub', balance: '0 BTC' },
        { id: 'out_pay', type: 'receiver', balance: '1.5 BTC' },
      ];
      const links = [
        { source: 'in_addr1', target: 'tx_root', value: '1.0 BTC' },
        { source: 'tx_root', target: 'out_pay', value: '1.5 BTC' },
      ];

      const res = verifyValueConservation(nodes, links);
      expect(res.passed).toBe(false);
      expect(res.violations.some(v => v.check === 'VALUE_CREATION_VIOLATION')).toBe(true);
    });

    it('flags negative miner fees', () => {
      const nodes = [
        { id: 'in_addr1', type: 'suspect', balance: '0.5 BTC' },
        { id: 'tx_root', type: 'hub', balance: '0 BTC' },
        { id: 'out_pay', type: 'receiver', balance: '0.5001 BTC' },
      ];
      const links = [
        { source: 'in_addr1', target: 'tx_root', value: '0.5 BTC' },
        { source: 'tx_root', target: 'out_pay', value: '0.5001 BTC' },
      ];

      const res = verifyValueConservation(nodes, links);
      expect(res.passed).toBe(false);
      expect(res.violations.some(v => v.check === 'NEGATIVE_MINER_FEE')).toBe(true);
    });
  });

  describe('verifyTemporalCausality', () => {
    it('passes when subsequent hops have ascending timestamps and block heights', () => {
      const nodes = [
        { id: 'tx_1', details: { blockTime: 1600000000, blockHeight: 700000 } },
        { id: 'out_1', details: { blockTime: 1600000000, blockHeight: 700000 } },
        { id: 'tx_2', details: { blockTime: 1600001000, blockHeight: 700002 } },
      ];
      const links = [
        { source: 'tx_1', target: 'out_1' },
        { source: 'out_1', target: 'tx_2' },
      ];

      const res = verifyTemporalCausality(nodes, links);
      expect(res.passed).toBe(true);
      expect(res.violations.length).toBe(0);
    });

    it('detects temporal inversion when spending predates creation', () => {
      const nodes = [
        { id: 'tx_1', details: { blockTime: 1600010000, blockHeight: 700010 } },
        { id: 'tx_2', details: { blockTime: 1600000000, blockHeight: 700000 } },
      ];
      const links = [
        { source: 'tx_1', target: 'tx_2' },
      ];

      const res = verifyTemporalCausality(nodes, links);
      expect(res.passed).toBe(false);
      expect(res.violations.some(v => v.check === 'TEMPORAL_INVERSION')).toBe(true);
      expect(res.violations.some(v => v.check === 'BLOCK_HEIGHT_INVERSION')).toBe(true);
    });
  });

  describe('verifyHeuristicConsistency', () => {
    it('passes for consistent heuristic directional scores', () => {
      const nodes = [
        { id: 'out_pay', type: 'receiver', balance: '0.5 BTC', details: { heuristics: { score: 3.5 } } },
        { id: 'out_chg', type: 'change', balance: '0.4 BTC', details: { heuristics: { score: -2.5 } } },
      ];

      const res = verifyHeuristicConsistency(nodes);
      expect(res.passed).toBe(true);
      expect(res.violations.length).toBe(0);
    });

    it('flags classification contradictions between score and type', () => {
      const nodes = [
        { id: 'out_bad_chg', type: 'change', balance: '0.4 BTC', details: { heuristics: { score: 4.5 } } },
        { id: 'out_bad_pay', type: 'receiver', balance: '0.5 BTC', details: { heuristics: { score: -4.5 } } },
      ];

      const res = verifyHeuristicConsistency(nodes);
      expect(res.passed).toBe(false);
      expect(res.violations.some(v => v.check === 'CHANGE_SCORE_CONTRADICTION')).toBe(true);
      expect(res.violations.some(v => v.check === 'RECEIVER_SCORE_CONTRADICTION')).toBe(true);
    });

    it('flags OP_RETURN outputs mistakenly labeled as receivers', () => {
      const nodes = [
        { id: 'op_tx1_0', type: 'receiver', balance: '0 BTC' }
      ];

      const res = verifyHeuristicConsistency(nodes);
      expect(res.passed).toBe(false);
      expect(res.violations.some(v => v.check === 'UNSPENDABLE_MARKED_AS_RECEIVER')).toBe(true);
    });
  });

  describe('verifyBip69Invariance', () => {
    it('verifies that output ordering permutations do not change verdicts', () => {
      const tx = {
        txid: 'mock_tx_bip69',
        vin: [{ prevout: { scriptpubkey_address: 'addr_funder' } }],
        vout: [
          { scriptpubkey_address: 'addr_funder', value: 900000, scriptpubkey_type: 'p2wpkh' }, // self-transfer
          { scriptpubkey_address: 'addr_merchant', value: 100000, scriptpubkey_type: 'p2wpkh' }
        ]
      };

      const res = verifyBip69Invariance(tx);
      expect(res.isInvariant).toBe(true);
      expect(res.diffs.length).toBe(0);
    });
  });

  describe('computeMultiModelConcordance', () => {
    it('computes 100% concordance when all models agree on destination sinks', () => {
      const nodes = [
        { id: 'suspect_1', type: 'suspect', balance: '1.0 BTC' },
        { id: 'out_receiver', type: 'receiver', balance: '0.99 BTC' },
      ];
      const links = [
        { source: 'suspect_1', target: 'out_receiver', value: '0.99 BTC' },
      ];

      const res = computeMultiModelConcordance(nodes, links);
      expect(res.score).toBe(1.0);
      expect(res.consensusSinks).toContain('out_receiver');
    });
  });

  describe('auditTraceCorrectness', () => {
    it('awards VERIFIED status and high assurance score to clean invariant-compliant graphs', () => {
      const graph = {
        nodes: [
          { id: 'in_suspect', type: 'suspect', balance: '2.0 BTC', details: { blockTime: 1600000000 } },
          { id: 'tx_root', type: 'hub', balance: '0 BTC', details: { blockTime: 1600000000 } },
          { id: 'out_pay', type: 'receiver', balance: '1.5 BTC', details: { blockTime: 1600000000, heuristics: { score: 3.0 } } },
          { id: 'out_chg', type: 'change', balance: '0.499 BTC', details: { blockTime: 1600000000, heuristics: { score: -2.0 } } },
        ],
        links: [
          { source: 'in_suspect', target: 'tx_root', value: '2.0 BTC' },
          { source: 'tx_root', target: 'out_pay', value: '1.5 BTC' },
          { source: 'tx_root', target: 'out_chg', value: '0.499 BTC' },
        ]
      };

      const audit = auditTraceCorrectness(graph);
      expect(audit.isAudited).toBe(true);
      expect(audit.isValid).toBe(true);
      expect(audit.assuranceScore).toBeGreaterThanOrEqual(90);
      expect(audit.rating).toBe('VERIFIED');
      expect(audit.summary).toContain('All 4 core forensic invariants mathematically verified');
    });

    it('downgrades rating to SUSPECT upon detecting value or temporal violations', () => {
      const badGraph = {
        nodes: [
          { id: 'in_suspect', type: 'suspect', balance: '1.0 BTC', details: { blockTime: 1600010000 } },
          { id: 'tx_root', type: 'hub', balance: '0 BTC', details: { blockTime: 1600000000 } }, // time inversion
          { id: 'out_pay', type: 'receiver', balance: '5.0 BTC' }, // value creation
        ],
        links: [
          { source: 'in_suspect', target: 'tx_root', value: '1.0 BTC' },
          { source: 'tx_root', target: 'out_pay', value: '5.0 BTC' },
        ]
      };

      const audit = auditTraceCorrectness(badGraph);
      expect(audit.isValid).toBe(false);
      expect(audit.assuranceScore).toBeLessThan(50);
      expect(audit.rating).toBe('SUSPECT');
    });
  });
});
