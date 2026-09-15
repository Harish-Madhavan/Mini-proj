import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { traceEndReceiver, clearCache, isCoinJoinTransaction } from './bitcoinApi';
import { calculateCoinJoinEntropy } from './clusteringAlgorithms';

const ok = (data) => ({ ok: true, status: 200, json: async () => data });

function txOf(vinCount, outValues) {
  return {
    txid: 'x',
    vin: Array.from({ length: vinCount }, (_, i) => ({
      prevout: { scriptpubkey_address: `bc1qin${i}`, scriptpubkey_type: 'v0_p2wpkh', value: 20000000 },
    })),
    vout: outValues.map((value, i) => ({
      scriptpubkey_address: `bc1qout${i}`, scriptpubkey_type: 'v0_p2wpkh', value,
    })),
    status: { confirmed: true, block_height: 800000, block_time: 1700000000 },
  };
}

describe('mixer precision', () => {
  it('rejects a coincidental triple inside a large batch (wild 8-in-147-out shape)', () => {
    const outs = [1234567, 1234567, 1234567];
    for (let i = 0; i < 144; i++) outs.push(100000 + i * 791);
    const tx = txOf(8, outs);
    expect(calculateCoinJoinEntropy(tx.vout).isCoinJoin).toBe(false);
    expect(isCoinJoinTransaction(tx)).toBe(false);
  });

  it('rejects a pool-denominated triple below the share gate', () => {
    const outs = [10000000, 10000000, 10000000];
    for (let i = 0; i < 144; i++) outs.push(200000 + i * 613);
    expect(isCoinJoinTransaction(txOf(8, outs))).toBe(false);
  });

  it('flags Wasabi-shaped rounds (dominant equal group)', () => {
    const outs = [...Array.from({ length: 8 }, () => 10000000), 500000, 300000];
    const tx = txOf(10, outs);
    expect(isCoinJoinTransaction(tx)).toBe(true);
  });

  it('flags small pool-anchored joins', () => {
    const outs = [10000000, 10000000, 500000];
    expect(isCoinJoinTransaction(txOf(3, outs))).toBe(true);
  });

  it('keeps plain splits and single-input txs clean', () => {
    expect(isCoinJoinTransaction(txOf(1, [10000000, 10000000, 500000]))).toBe(false);
    expect(isCoinJoinTransaction(txOf(2, [1000000, 500000]))).toBe(false);
  });
});

describe('mixer halt path', () => {
  const ROOT = 'c'.repeat(64);
  beforeEach(() => clearCache());
  afterEach(() => { vi.unstubAllGlobals(); clearCache(); });

  it('halts at a CoinJoin root with mixer nodes and no forward expansion', async () => {
    const rootTx = {
      ...txOf(5, [...Array.from({ length: 4 }, () => 10000000), 500000, 300000]),
      txid: ROOT,
    };
    vi.stubGlobal('fetch', async (url) => {
      if (url.includes(`/tx/${ROOT}/outspends`)) return ok(rootTx.vout.map(() => ({ spent: false })));
      if (url.includes(`/tx/${ROOT}`)) return ok(rootTx);
      return { ok: false, status: 404, json: async () => [] };
    });
    const res = await traceEndReceiver(ROOT, 2);
    expect(res.meta.haltReason).toBe('COINJOIN_AT_ROOT');
    expect(res.meta.confidence).toBeNull();
    expect(res.meta.warnings.some(w => /Mixing/i.test(w))).toBe(true);
    expect(res.nodes.some(n => n.type === 'mixer')).toBe(true);
    // No output expansion past the halted hub
    expect(res.nodes.some(n => n.id.startsWith('out_'))).toBe(false);
  });
});
