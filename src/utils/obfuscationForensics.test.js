import { describe, it, expect } from 'vitest';
import { 
  calculateOutputEntropy, 
  analyzeCoinJoinSignature, 
  analyzeCasePeelingChains, 
  scanCrossChainBridgeActivity, 
  generateObfuscationDossier 
} from './obfuscationForensics';

describe('obfuscationForensics', () => {
  it('calculates Shannon entropy correctly for equal output distributions', () => {
    // 4 identical outputs -> log2(4) = 2.0
    const entropy = calculateOutputEntropy([5000000, 5000000, 5000000, 5000000]);
    expect(entropy).toBeCloseTo(2.0, 1);
  });

  it('detects CoinJoin signature with equal denominations matching standard Whirlpool pool', () => {
    const mockCoinJoinTx = {
      txid: 'abc123mocktx',
      vin: [{ txid: 'in1', vout: 0 }, { txid: 'in2', vout: 1 }],
      vout: [
        { value: 5000000, scriptpubkey: '0014...' }, // 0.05 BTC pool
        { value: 5000000, scriptpubkey: '0014...' },
        { value: 5000000, scriptpubkey: '0014...' },
        { value: 124000, scriptpubkey: '0014...' }   // change
      ]
    };
    const analysis = analyzeCoinJoinSignature(mockCoinJoinTx);
    expect(analysis.isCoinJoin).toBe(true);
    expect(analysis.anonymitySet).toBe(3);
    expect(analysis.confidence).toBeGreaterThanOrEqual(70);
    expect(analysis.matchedPool).toContain('0.050 BTC');
  });

  it('analyzes case peeling chains with multiple linear hops', () => {
    const nodes = [
      { id: 'suspect', type: 'suspect', balance: '10 BTC' },
      { id: 'hop1', type: 'hop', balance: '9 BTC' },
      { id: 'hop2', type: 'hop', balance: '8 BTC' },
      { id: 'receiver', type: 'receiver', balance: '1 BTC' }
    ];
    const links = [
      { source: 'suspect', target: 'hop1', value: '10 BTC' },
      { source: 'hop1', target: 'hop2', value: '9 BTC' },
      { source: 'hop2', target: 'receiver', value: '1 BTC' }
    ];
    const peeling = analyzeCasePeelingChains(nodes, links);
    expect(peeling.isPeelingChain).toBe(true);
    expect(peeling.hopCount).toBe(2);
    expect(peeling.layeringMaturity).toBe('Moderate');
  });

  it('scans and identifies cross-chain swap routers', () => {
    const nodes = [
      { id: 'node_1', label: 'Transit Hop', details: { address: 'bc1qsimple' } },
      { id: 'node_2', label: 'FixedFloat Gateway', details: { address: '1FixedFloatBridgeDeposit' } }
    ];
    const scan = scanCrossChainBridgeActivity(nodes);
    expect(scan.detected).toBe(true);
    expect(scan.routersFound.length).toBe(1);
    expect(scan.routersFound[0].routerName).toContain('FixedFloat');
  });

  it('generates a full obfuscation dossier with composite score and recommendations', () => {
    const mockCase = {
      id: 'case-test-01',
      nodes: [
        { id: 's', type: 'suspect' },
        { id: 'm', type: 'mixer' },
        { id: 'h1', type: 'hop' },
        { id: 'h2', type: 'hop' },
        { id: 'r', type: 'receiver' }
      ],
      links: [
        { source: 's', target: 'm', value: '5 BTC' },
        { source: 'm', target: 'h1', value: '2.5 BTC' },
        { source: 'h1', target: 'h2', value: '2 BTC' },
        { source: 'h2', target: 'r', value: '1.8 BTC' }
      ]
    };
    const dossier = generateObfuscationDossier(mockCase);
    expect(dossier.obfuscationScore).toBeGreaterThan(60);
    expect(dossier.hasMixer).toBe(true);
    expect(dossier.recommendations.length).toBeGreaterThan(0);
  });
});
