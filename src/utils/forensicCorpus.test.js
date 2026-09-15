import { describe, it, expect } from 'vitest';
import { scanCaseStructuring } from './structuringAnalysis';
import { detectConsolidationSweep } from './obfuscationForensics';
import { scoreOutputHeuristics } from './traceHeuristics';
import { formatBlockstreamTx } from './bitcoinApi';
import { validateBtcAddress } from './forensicUtils';
import { FORENSIC_CORPUS } from '../data/forensicCorpus';

// Graph-shaped links mirroring the verified 1-in-57 batch dispersal
// (4f11f496…): 19x10 BTC band + sub-cap dust fragments + remainder.
function batchLinks() {
  const links = [];
  const push = (n, value) => { for (let i = 0; i < n; i++) links.push({ source: 'tx_batch', target: `out_${i}_${value}`, value }); };
  push(19, '10.000000 BTC');
  push(2, '0.001559 BTC');
  push(2, '0.000779 BTC');
  push(1, '0.001500 BTC');
  push(1, '0.001450 BTC');
  push(3, '0.002400 BTC');
  push(1, '0.000265 BTC');
  push(1, '51.000000 BTC');
  return links;
}

describe('forensic corpus regression (static fixtures, live-verified shapes)', () => {
  it('rejects dust-fragment bands in the batch dispersal (share gate)', () => {
    const nodes = [{ id: 'tx_batch', type: 'hop' }];
    const r = scanCaseStructuring(nodes, batchLinks());
    expect(r.detected).toBe(false);
  });

  it('still flags economically meaningful bands', () => {
    const nodes = [{ id: 'tx_smurf', type: 'hop' }];
    const links = [
      ...Array.from({ length: 5 }, (_, i) => ({ source: 'tx_smurf', target: `o${i}`, value: '0.100000 BTC' })),
      { source: 'tx_smurf', target: 'chg', value: '0.400000 BTC' },
    ];
    const r = scanCaseStructuring(nodes, links);
    expect(r.detected).toBe(true);
    expect(r.maxBandSize).toBe(5);
  });

  it('formats the genesis coinbase without crashing', () => {
    const genesisLike = {
      txid: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
      fee: 0,
      size: 204,
      weight: 816,
      vin: [{ sequence: 0xffffffff, is_coinbase: true }],
      vout: [{
        scriptpubkey: '4104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac',
        scriptpubkey_asm: 'OP_PUSHBYTES_65 04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac OP_CHECKSIG',
        scriptpubkey_type: 'p2pk',
        value: 5000000000,
      }],
      status: { confirmed: true, block_height: 0, block_time: 1231006505 },
    };
    const formatted = formatBlockstreamTx(genesisLike, [{ spent: false }]);
    expect(formatted.nodes.some(n => n.id.startsWith('in_Coinbase'))).toBe(true);
    const out = formatted.nodes.find(n => n.id.startsWith('out_'));
    expect(out.label).toContain('early network');
  });

  it('flags the live-verified ransom sweep (76-in-1-out) as WATCH payment', () => {
    // 35e5d5fe…: 76 funder inputs, 9.028 BTC to a fresh address, urgent fee.
    const per = 11891405;
    const tx = {
      vin: Array.from({ length: 76 }, () => ({
        prevout: { scriptpubkey_address: '12t9YDPgwueZ9NyMgw519p7AA8isjr6SMw', scriptpubkey_type: 'p2pkh', value: per },
      })),
      vout: [{ scriptpubkey_address: '16dfTuSx4f78eQ81PzTgBtBDyZ7QhNZ8Vy', scriptpubkey_type: 'p2pkh', value: 902796322 }],
    };
    const sweep = detectConsolidationSweep({ ...tx, fee: 1055079 });
    expect(sweep.isSweep).toBe(true);
    expect(sweep.inputCount).toBe(76);
    expect(sweep.cashoutUrgency).toBe('WATCH');
    // H8: sole fresh output → high-confidence payment despite 76 inputs
    const scored = scoreOutputHeuristics({
      tx: { ...tx, fee: 1055079, vsize: 11500, weight: 46000, status: { confirmed: true, block_height: 478796, block_time: 1501770000 } },
      outputIndex: 0,
      inputScriptTypes: ['Legacy (P2PKH)'],
      outspends: [{ spent: true, status: { block_height: 478829 } }],
      seenAddresses: new Set(['12t9YDPgwueZ9NyMgw519p7AA8isjr6SMw']),
    });
    expect(scored.isPaymentCandidate).toBe(true);
    expect(scored.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('flags the pizza-shaped many-in-one-out as a WATCH sweep (not imminent)', () => {
    const per = 7633587786;
    const tx = {
      vin: Array.from({ length: 131 }, () => ({
        prevout: { scriptpubkey_address: '1XPTgDRhN8RFnzniWCddobD9iKZatrvH4', scriptpubkey_type: 'p2pkh', value: per },
      })),
      vout: [{ scriptpubkey_address: '17SkEw2md5avVNyYgj6RiXuQKNwkXaxFyQ', scriptpubkey_type: 'p2pkh', value: 1000000000000 }],
    };
    const r = detectConsolidationSweep(tx);
    expect(r.isSweep).toBe(true);
    expect(r.inputCount).toBe(131);
    expect(r.cashoutUrgency).toBe('WATCH');
  });

  it('corpus entries are well-formed mainnet identifiers', () => {
    expect(FORENSIC_CORPUS.length).toBeGreaterThanOrEqual(6);
    const keys = new Set(FORENSIC_CORPUS.map(e => e.key));
    expect(keys.size).toBe(FORENSIC_CORPUS.length);
    for (const e of FORENSIC_CORPUS) {
      if (e.kind === 'tx') expect(e.value).toMatch(/^[0-9a-fA-F]{64}$/);
      if (e.kind === 'address') expect(validateBtcAddress(e.value).isValid).toBe(true);
      expect(e.expectation.length).toBeGreaterThan(0);
    }
  });
});
