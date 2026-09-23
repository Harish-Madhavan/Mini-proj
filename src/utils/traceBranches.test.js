import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { traceEndReceiver, clearCache } from './bitcoinApi';

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const notFound = () => ({ ok: false, status: 404, json: async () => [] });

function txShape({ txid, ins, outs, fee = 1000, height = 800000, time = 1700000000 }) {
  return {
    txid, fee, size: 250, vsize: 250, weight: 1000,
    vin: ins.map(([addr, value]) => ({
      sequence: 0xffffffff,
      prevout: { scriptpubkey_address: addr, scriptpubkey_type: 'v0_p2wpkh', value },
    })),
    vout: outs.map(([addr, value]) => ({
      scriptpubkey_address: addr, scriptpubkey_type: 'v0_p2wpkh', value,
    })),
    status: { confirmed: true, block_height: height, block_time: time },
  };
}

function stubRoutes(routes) {
  vi.stubGlobal('fetch', async (url) => {
    for (const [match, data] of routes) {
      if (url.includes(match)) return ok(data);
    }
    return notFound();
  });
}

describe('trace branch behavior', () => {
  beforeEach(() => clearCache());
  afterEach(() => { vi.unstubAllGlobals(); clearCache(); });

  it('never queues spent dust outputs', async () => {
    const ROOT = 'd'.repeat(64);
    const DUST_CHILD = 'e'.repeat(64);
    const root = txShape({
      txid: ROOT,
      ins: [['bc1qsrc11111111111111111111111111', 2000000]],
      outs: [['bc1qdust111111111111111111111111', 300], ['bc1qmain111111111111111111111111', 1998700]],
    });
    stubRoutes([
      [`/tx/${ROOT}/outspends`, [{ spent: true, txid: DUST_CHILD, status: { confirmed: true, block_height: 800001 } }, { spent: false }]],
      [`/tx/${ROOT}`, root],
    ]);
    const res = await traceEndReceiver(ROOT, 2);
    expect(res.nodes.find(n => n.id === 'out_bc1qdust111111111111111111111111')).toBeDefined();
    expect(res.nodes.some(n => n.id === `tx_${DUST_CHILD}`)).toBe(false);
    expect(res.meta.stats.fetchedTxCount).toBe(1);
  });

  it('skips self-loop spends without hanging', async () => {
    const ROOT = 'd'.repeat(64);
    const root = txShape({
      txid: ROOT,
      ins: [['bc1qself1111111111111111111111111', 5000000]],
      outs: [['bc1qself1111111111111111111111111', 4999000]],
    });
    stubRoutes([
      [`/tx/${ROOT}/outspends`, [{ spent: true, txid: ROOT, status: { confirmed: true, block_height: 800001 } }]],
      [`/tx/${ROOT}`, root],
    ]);
    const res = await traceEndReceiver(ROOT, 2);
    expect(res.meta.stats.fetchedTxCount).toBe(1);
    expect(res.nodes.filter(n => n.id === `tx_${ROOT}`).length).toBe(1);
  });

  it('halts a mid-trace mixing branch while siblings continue', async () => {
    const ROOT = 'd'.repeat(64);
    const MIX = 'e'.repeat(64);
    const NEXT = 'f'.repeat(64);
    const root = txShape({
      txid: ROOT,
      ins: [['bc1qsrc11111111111111111111111111', 50000000]],
      outs: [['bc1qmix11111111111111111111111111', 20000000], ['bc1qok111111111111111111111111111', 29999000]],
    });
    const mixTx = {
      txid: MIX, fee: 10000, size: 2000, vsize: 2000, weight: 8000,
      vin: Array.from({ length: 5 }, (_, i) => ({
        sequence: 0xffffffff,
        prevout: { scriptpubkey_address: `bc1qmixer${i}11111111111111111111`, scriptpubkey_type: 'v0_p2wpkh', value: 20000000 },
      })),
      vout: [...Array.from({ length: 4 }, (_, i) => ({
        scriptpubkey_address: `bc1qwasabi${i}1111111111111111111`, scriptpubkey_type: 'v0_p2wpkh', value: 10000000,
      })), { scriptpubkey_address: 'bc1qchg', scriptpubkey_type: 'v0_p2wpkh', value: 59990000 }],
      status: { confirmed: true, block_height: 800001, block_time: 1700000000 },
    };
    const nextTx = txShape({
      txid: NEXT,
      ins: [['bc1qok111111111111111111111111111', 29999000]],
      outs: [['bc1qend11111111111111111111111111', 29998000]],
    });
    stubRoutes([
      [`/tx/${ROOT}/outspends`, [
        { spent: true, txid: MIX, status: { confirmed: true, block_height: 800001 } },
        { spent: true, txid: NEXT, status: { confirmed: true, block_height: 800001 } },
      ]],
      [`/tx/${ROOT}`, root],
      [`/tx/${MIX}/outspends`, mixTx.vout.map(() => ({ spent: false }))],
      [`/tx/${MIX}`, mixTx],
      [`/tx/${NEXT}/outspends`, [{ spent: false }]],
      [`/tx/${NEXT}`, nextTx],
    ]);
    const res = await traceEndReceiver(ROOT, 2);
    // Mixer hub present but never expanded; halt is branch-local.
    expect(res.nodes.some(n => n.id === `tx_${MIX}` && n.type === 'mixer')).toBe(true);
    expect(res.nodes.some(n => n.id.startsWith('out_bc1qwasabi'))).toBe(false);
    expect(res.meta.haltReason).toBeNull();
    expect(res.meta.warnings.some(w => w.includes(MIX.slice(0, 8)))).toBe(true);
    // Sibling branch traced through to its terminal.
    expect(res.nodes.some(n => n.id === `tx_${NEXT}`)).toBe(true);
    expect(res.nodes.some(n => n.id === 'out_bc1qend11111111111111111111111111')).toBe(true);
  });

  it('caps peel extension at +2 on longer chains', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(ch => ch.repeat(64));
    const levels = ids.map((id, i) => {
      const t = txShape({
        txid: id,
        ins: [['bc1qchain11111111111111111111111', 10000000]],
        outs: [
          [`bc1qpeel${i}1111111111111111111111111`, 1000000],
          ['bc1qchain11111111111111111111111', 8999000],
        ],
        fee: 1000, height: 800000 + i * 10,
      });
      return {
        id,
        tx: t,
        outspends: [
          { spent: false },
          i < 6
            ? { spent: true, txid: ids[i + 1], status: { confirmed: true, block_height: 800000 + i * 10 + 5 } }
            : { spent: false },
        ],
      };
    });
    stubRoutes(levels.flatMap(l => [
      [`/tx/${l.id}/outspends`, l.outspends],
      [`/tx/${l.id}`, l.tx],
    ]));
    const res = await traceEndReceiver(ids[0], 2);
    const hubs = ids.filter(id => res.nodes.some(n => n.id === `tx_${id}`));
    expect(hubs).toEqual(ids.slice(0, 5));
    expect(res.meta.stats.depthReached).toBe(4);
  });

  it('refines ambiguous unspent end receivers with chain data', async () => {
    const ROOT = 'd'.repeat(64);
    const RECV = 'bc1qrecv1111111111111111111111111';
    const root = txShape({
      txid: ROOT,
      ins: [['bc1qsrc11111111111111111111111111', 1735567]],
      outs: [
        [RECV, 1234567],
        ['bc1qchg11111111111111111111111111', 500000],
      ],
      fee: 1000,
    });
    stubRoutes([
      [`/tx/${ROOT}/outspends`, [{ spent: false }, { spent: false }]],
      [`/tx/${ROOT}`, root],
      [`/address/${RECV}`, { chain_stats: { funded_txo_count: 4, funded_txo_sum: 5000000, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 4 }, mempool_stats: {} }],
    ]);
    const res = await traceEndReceiver(ROOT, 1);
    const node = res.nodes.find(n => n.id === `out_${RECV}`);
    expect(node).toBeDefined();
    expect(node.label).toContain('End receiver');
    expect(node.details.heuristicScore).toBeGreaterThan(1.0);
  });
});
