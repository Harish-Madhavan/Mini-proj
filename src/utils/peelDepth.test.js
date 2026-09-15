import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { traceEndReceiver, clearCache } from './bitcoinApi';

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const notFound = () => ({ ok: false, status: 404, json: async () => [] });

// Linear peel chain reusing one change address (pizza-funder pattern):
// each level pays a small peel to a fresh address (left unspent) and returns
// change to its own address, spent into the next level.
const CHAIN_ADDR = 'bc1qchain11111111111111111111111';

function peelLevel(id, peelAddr, nextTxid, height) {
  return {
    id,
    tx: {
      txid: id,
      fee: 1000, size: 250, vsize: 250, weight: 1000,
      vin: [{
        sequence: 0xffffffff,
        prevout: { scriptpubkey_address: CHAIN_ADDR, scriptpubkey_type: 'v0_p2wpkh', value: 10000000 },
      }],
      vout: [
        { scriptpubkey_address: peelAddr, scriptpubkey_type: 'v0_p2wpkh', value: 1000000 },
        { scriptpubkey_address: CHAIN_ADDR, scriptpubkey_type: 'v0_p2wpkh', value: 8999000 },
      ],
      status: { confirmed: true, block_height: height, block_time: 1700000000 },
    },
    outspends: [
      { spent: false },
      { spent: true, txid: nextTxid, status: { confirmed: true, block_height: height + 5 } },
    ],
  };
}

describe('peel-priority depth extension', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'].map(ch => ch.repeat(64));

  beforeEach(() => clearCache());
  afterEach(() => { vi.unstubAllGlobals(); clearCache(); });

  it('follows high-confidence change past maxDepth, capped at +2', async () => {
    const levels = ids.map((id, i) => peelLevel(
      id,
      `bc1qpeel${i}11111111111111111111111111`,
      i < 4 ? ids[i + 1] : 'f'.repeat(64),
      800000 + i * 10
    ));

    vi.stubGlobal('fetch', async (url) => {
      for (const level of levels) {
        if (url.includes(`/tx/${level.id}/outspends`)) return ok(level.outspends);
        if (url.includes(`/tx/${level.id}`)) return ok(level.tx);
      }
      return notFound();
    });

    const res = await traceEndReceiver(ids[0], 2);
    const fetchedHubs = ids.filter(id => res.nodes.some(n => n.id === `tx_${id}`));
    // A,B,C within maxDepth=2 plus D,E via change extension (capped at +2).
    expect(fetchedHubs).toEqual(ids);
    expect(res.meta.stats.depthReached).toBe(4);
    expect(res.meta.stats.fetchedTxCount).toBe(5);
  });
});
