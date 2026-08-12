import { describe, it, expect } from 'vitest';
import { createLiveTxCase, createAddressTraceCase, createAlgorithmicTraceCase } from './caseHelpers';
import { SCENARIOS } from '../data/scenarios';

describe('caseHelpers utilities', () => {
  it('should create a live transaction case correctly', () => {
    const mockTxId = '4b9a8f2e71d3c05c8a9f0e1d2c3b4a5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b';
    const mockNodesLinks = {
      nodes: [{ id: 'tx_4b9a8f2e', label: 'Tx Node' }],
      links: [{ source: 'tx_4b9a8f2e', target: 'out_addr' }]
    };

    const result = createLiveTxCase(mockTxId, mockNodesLinks, SCENARIOS);
    expect(result.newCaseId).toBe('live-btc-4b9a8f2e');
    expect(result.scenarios.length).toBe(SCENARIOS.length + 1);
    expect(result.scenarios[0].id).toBe('live-btc-4b9a8f2e');
    expect(result.scenarios[0].currency).toBe('BTC');
  });

  it('should create an address trace case correctly', () => {
    const mockAddress = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
    const mockTxId = '4b9a8f2e71d3c05c8a9f0e1d2c3b4a5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b';
    const mockNodesLinks = {
      nodes: [{ id: 'in_bc1qxy2k', label: 'Address Node' }],
      links: []
    };

    const result = createAddressTraceCase(mockAddress, 5, mockTxId, mockNodesLinks, SCENARIOS);
    expect(result.newCaseId).toBe('addr-btc-bc1qxy2k');
    expect(result.scenarios[0].description).toContain('Fetched 5 transactions');
  });

  it('should generate a deterministic algorithmic trace case', () => {
    const query = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
    const result1 = createAlgorithmicTraceCase(query, SCENARIOS);
    const result2 = createAlgorithmicTraceCase(query, SCENARIOS);

    expect(result1.newCaseId).toBe(result2.newCaseId);
    expect(result1.scenarios[0].nodes.length).toBe(3);
    expect(result1.scenarios[0].links.length).toBe(2);
    expect(result1.scenarios[0].currency).toBe('BTC');
  });
});
