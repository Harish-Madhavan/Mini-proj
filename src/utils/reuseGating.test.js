import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { traceEndReceiver, clearCache } from './bitcoinApi';

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const notFound = () => ({ ok: false, status: 404, json: async () => [] });

const ROOT = 'd'.repeat(64);
const CHILD = 'e'.repeat(64);
const ADDR_A = 'bc1qamba1111111111111111111111111';
const ADDR_B = 'bc1qambb1111111111111111111111111';
const ADDR_IN = 'bc1qsrcftx11111111111111111111111';

const rootTx = {
  txid: ROOT,
  fee: 1000, size: 250, vsize: 250, weight: 1000,
  vin: [{
    sequence: 0xffffffff,
    prevout: { scriptpubkey_address: ADDR_IN, scriptpubkey_type: 'v0_p2wpkh', value: 5000000 },
  }],
  vout: [
    { scriptpubkey_address: ADDR_A, scriptpubkey_type: 'v0_p2wpkh', value: 3000000 },
    { scriptpubkey_address: ADDR_B, scriptpubkey_type: 'v0_p2wpkh', value: 1999000 },
  ],
  status: { confirmed: true, block_height: 800000, block_time: 1700000000 },
};
const rootOutspends = [
  { spent: true, txid: CHILD, status: { confirmed: true, block_height: 800500 } },
  { spent: false },
];

describe('ambiguity-gated chain-reuse fetch', () => {
  beforeEach(() => clearCache());
  afterEach(() => { vi.unstubAllGlobals(); clearCache(); });

  it('fetches summaries only for ambiguous outputs and refines them', async () => {
    const fetched = [];
    vi.stubGlobal('fetch', async (url) => {
      fetched.push(url);
      if (url.includes(`/tx/${ROOT}/outspends`)) return ok(rootOutspends);
      if (url.includes(`/tx/${ROOT}`)) return ok(rootTx);
      if (url.includes(`/address/${ADDR_A}`)) {
        return ok({ chain_stats: { funded_txo_count: 5, funded_txo_sum: 15000000, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 5 }, mempool_stats: {} });
      }
      return notFound();
    });

    const res = await traceEndReceiver(ROOT, 1);

    // Ambiguous output A (reused on-chain) flips to Payment...
    const nodeA = res.nodes.find(n => n.id === `out_${ADDR_A}`);
    expect(nodeA).toBeDefined();
    expect(nodeA.label).toBe('Payment');
    expect(nodeA.details.heuristicScore).toBeGreaterThan(1.0);
    // ...decisive output B is untouched and never fetched...
    const nodeB = res.nodes.find(n => n.id === `out_${ADDR_B}`);
    expect(nodeB.label).toContain('End receiver');
    const summaryUrls = fetched.filter(u => u.includes('/address/'));
    expect(summaryUrls).toEqual([`https://blockstream.info/api/address/${ADDR_A}`]);
    // ...and the flipped payment is still followed forward.
    expect(res.meta.warnings.some(w => w.includes(CHILD.slice(0, 8)))).toBe(true);
  });
});
