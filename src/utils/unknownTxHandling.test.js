import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { traceEndReceiver, clearCache } from './bitcoinApi';
import { createLiveTxCase } from './caseHelpers';

// The txid from the field report: valid 64-hex, absent from both gateways.
const UNKNOWN_TXID = '264828a1c841804f329971ff2cfb61bc469af1deee73797c27ec09e6c4667d4e';
const ROOT = 'a'.repeat(64);
const CHILD = 'b'.repeat(64);

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const notFound = () => ({ ok: false, status: 404, json: async () => [] });

function rootFixture() {
  return {
    txid: ROOT,
    fee: 1000,
    size: 200,
    weight: 800,
    vin: [{
      sequence: 0xffffffff,
      prevout: { scriptpubkey_address: 'bc1qsrc', scriptpubkey_type: 'v0_p2wpkh', value: 5000000 },
    }],
    vout: [
      { scriptpubkey_address: 'bc1qpay', scriptpubkey_type: 'v0_p2wpkh', value: 2000000 },
      { scriptpubkey_address: 'bc1qchg', scriptpubkey_type: 'v0_p2wpkh', value: 2999000 },
    ],
    status: { confirmed: true, block_height: 800000, block_time: 1700000000 },
  };
}

function rootOutspends(spentFirstToChild) {
  return [
    spentFirstToChild
      ? { spent: true, txid: CHILD, status: { confirmed: true, block_height: 800001 } }
      : { spent: false },
    { spent: false },
  ];
}

describe('unknown-transaction handling', () => {
  beforeEach(() => clearCache());
  afterEach(() => { vi.unstubAllGlobals(); clearCache(); });

  it('throws a not-found error for the reported unknown txid instead of an empty graph', async () => {
    vi.stubGlobal('fetch', async () => notFound());
    await expect(traceEndReceiver(UNKNOWN_TXID, 1)).rejects.toThrow(/not found on the live network/);
  });

  it('propagates gateway outages (non-404) with the underlying reason', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('socket hang up'); });
    await expect(traceEndReceiver(ROOT, 1)).rejects.toThrow(/socket hang up/);
  });

  it('warns and prunes on deep-hop failure without aborting the trace', async () => {
    vi.stubGlobal('fetch', async (url) => {
      if (url.includes(`/tx/${ROOT}/outspends`)) return ok(rootOutspends(true));
      if (url.includes(`/tx/${ROOT}`)) return ok(rootFixture());
      return notFound(); // the child spend is missing downstream
    });
    const res = await traceEndReceiver(ROOT, 2);
    expect(res.nodes.some(n => n.id === `tx_${ROOT}`)).toBe(true);
    expect(res.links.length).toBeGreaterThan(0);
    expect(res.meta.warnings.some(w => w.includes(CHILD.slice(0, 8)))).toBe(true);
  });

  it('refuses to mint an empty live case', () => {
    expect(() => createLiveTxCase(UNKNOWN_TXID, { nodes: [], links: [] }, []))
      .toThrow(/refusing to create an empty case/);
  });
});
