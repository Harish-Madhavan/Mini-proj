import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  apiCache,
  clearCache,
  formatBlockstreamTx,
  getScriptTypeFromAddress,
  parseOpReturnPayload,
  isCoinJoinTransaction,
  addressTxVolumeSats,
  pickSignificantTx,
  findSignificantAddressTx
} from './bitcoinApi';
import { ADDRESS_TRACE_CONFIG } from '../constants/config';
import { API_CONFIG } from '../constants/config';

describe('bitcoinApi LRU Cache & Formatting', () => {
  beforeEach(() => {
    clearCache();
  });

  it('should store items in LRU cache up to MAX_CACHE_SIZE', () => {
    for (let i = 0; i < API_CONFIG.MAX_CACHE_SIZE + 5; i++) {
      const key = `/tx/mock_tx_${i}`;
      if (apiCache.size >= API_CONFIG.MAX_CACHE_SIZE) {
        const oldestKey = apiCache.keys().next().value;
        if (oldestKey) apiCache.delete(oldestKey);
      }
      apiCache.set(key, { timestamp: Date.now(), data: { id: i } });
    }

    expect(apiCache.size).toBe(API_CONFIG.MAX_CACHE_SIZE);
    expect(apiCache.has('/tx/mock_tx_0')).toBe(false);
    expect(apiCache.has(`/tx/mock_tx_${API_CONFIG.MAX_CACHE_SIZE + 4}`)).toBe(true);
  });

  it('should format raw blockstream tx into nodes and links with rich metrics', () => {
    const rawTx = {
      txid: '4b9a8f2e71d3c05c8a9f0e1d2c3b4a5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b',
      fee: 5000,
      size: 220,
      weight: 880,
      vin: [
        {
          sequence: 0xfffffffd,
          prevout: {
            scriptpubkey_address: 'bc1qsourceaddress1234567890',
            scriptpubkey_type: 'v0_p2wpkh',
            value: 100000000
          }
        }
      ],
      vout: [
        {
          scriptpubkey_address: 'bc1qreceiveraddress1234567890',
          scriptpubkey_type: 'v0_p2wpkh',
          value: 99995000
        }
      ],
      status: { confirmed: true, block_height: 800000, block_time: 1600000000 }
    };

    const formatted = formatBlockstreamTx(rawTx);
    expect(formatted.nodes.length).toBeGreaterThan(0);
    expect(formatted.links.length).toBeGreaterThan(0);
    const txNode = formatted.nodes.find(n => n.id.startsWith('tx_'));
    expect(txNode).toBeDefined();
    expect(txNode.details.feeRateSatVb).toContain('satoshis per byte');
    expect(txNode.details.rbfStatus).toBe('Replaceable fee');
  });

  it('should label dust outputs as uneconomic and skip payment logic', () => {
    const dustyTx = {
      txid: 'dust0001',
      fee: 500,
      size: 200,
      weight: 800,
      vin: [{
        sequence: 0xffffffff,
        prevout: { scriptpubkey_address: 'bc1qsrc', scriptpubkey_type: 'v0_p2wpkh', value: 1000000 }
      }],
      vout: [
        { scriptpubkey_address: 'bc1qdust', scriptpubkey_type: 'v0_p2wpkh', value: 300 },
        { scriptpubkey_address: 'bc1qmain', scriptpubkey_type: 'v0_p2wpkh', value: 999200 }
      ],
      status: { confirmed: true, block_height: 800000, block_time: 1700000000 }
    };
    const formatted = formatBlockstreamTx(dustyTx, [{ spent: false }, { spent: false }]);
    const dust = formatted.nodes.find(n => n.id === 'out_bc1qdust');
    expect(dust).toBeDefined();
    expect(dust.label).toBe('Dust Output');
    expect(dust.type).toBe('hop');
  });

  it('should classify script types accurately', () => {
    expect(getScriptTypeFromAddress('bc1p0xlxue26wmcc5qcu2v2h2ygq2hld0007z7z42q')).toContain('Taproot');
    expect(getScriptTypeFromAddress('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toContain('Native SegWit');
    expect(getScriptTypeFromAddress('3E8tba8j1604a1122')).toContain('P2SH');
    expect(getScriptTypeFromAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toContain('Legacy');
  });

  it('should parse OP_RETURN payloads and decode ASCII notes', () => {
    const opOutput = {
      scriptpubkey_type: 'op_return',
      scriptpubkey_asm: 'OP_RETURN 68656c6c6f20776f726c64', // "hello world"
      value: 0
    };

    const parsed = parseOpReturnPayload(opOutput);
    expect(parsed).not.toBeNull();
    expect(parsed.decodedText).toContain('hello world');
  });

  it('should detect CoinJoin privacy mixing transactions', () => {    const coinJoinTx = {
      txid: 'coinjoin123',
      vin: [{ txid: 'a' }, { txid: 'b' }, { txid: 'c' }],
      vout: [
        { scriptpubkey_address: 'addr1', value: 1000000 },
        { scriptpubkey_address: 'addr2', value: 1000000 },
        { scriptpubkey_address: 'change', value: 500000 }
      ]
    };

    expect(isCoinJoinTransaction(coinJoinTx)).toBe(true);

    const normalTx = {
      txid: 'normal123',
      vin: [{ txid: 'a' }],
      vout: [
        { scriptpubkey_address: 'addr1', value: 1000000 },
        { scriptpubkey_address: 'change', value: 500000 }
      ]
    };

    expect(isCoinJoinTransaction(normalTx)).toBe(false);
  });

  it('should classify an early-era sole fresh output as payment despite 1-block dwell (pizza shape)', () => {
    // May-2010 pizza purchase shape: many funder inputs, one fresh output,
    // spent in the very next block. Sole-fresh identity is payment by
    // construction — dwell must not override it into a change step.
    const funder = '1XPTgDRhN8RFnzniWCddobD9iKZatrvH4';
    const fresh = '17SkEw2md5avVNyYgj6RiXuQKNwkXaxFyQ';
    const pizzaLike = {
      txid: 'ab'.repeat(32),
      fee: 99000000,
      size: 20000,
      weight: 80000,
      vin: Array.from({ length: 131 }, () => ({
        sequence: 0xffffffff,
        prevout: { scriptpubkey_address: funder, scriptpubkey_type: 'p2pkh', value: 7633587786 },
      })),
      vout: [{ scriptpubkey_address: fresh, scriptpubkey_type: 'p2pkh', value: 1000000000000 }],
      status: { confirmed: true, block_height: 57043, block_time: 1273431511 },
    };
    const formatted = formatBlockstreamTx(pizzaLike, [{ spent: true, status: { block_height: 57044 } }]);
    const out = formatted.nodes.find(n => n.id === `out_${fresh}`);
    expect(out).toBeDefined();
    expect(out.label).toBe('Payment (early network)');
    expect(out.details?.kycStatus).toBe('HISTORICAL PAYMENT');
  });

  it('measures address involvement ignoring foreign value and coinbase inputs', () => {
    const tx = {
      txid: 'vol0001',
      vin: [
        { prevout: { scriptpubkey_address: '1HQ3', value: 6936916716000 } },
        { prevout: { scriptpubkey_address: '1Other', value: 5000000000 } },
        { sequence: 0xffffffff, is_coinbase: true }
      ],
      vout: [
        { scriptpubkey_address: 'bc1qgov', value: 6936916628020 },
        { scriptpubkey_address: '1HQ3', value: 100000 }
      ]
    };
    // 69,369.16716 BTC out as sender + 100k sats back as receiver.
    expect(addressTxVolumeSats(tx, '1HQ3')).toBe(6936916716000 + 100000);
    expect(addressTxVolumeSats(tx, 'bc1qgov')).toBe(6936916628020);
    expect(addressTxVolumeSats(tx, '1Nobody')).toBe(0);
    expect(addressTxVolumeSats(null, '1HQ3')).toBe(0);
  });

  it('picks the seizure move over dust when selecting an address trace', () => {
    const dust = (id, sats) => ({
      txid: id,
      vin: [{ prevout: { scriptpubkey_address: '1HQ3', value: sats } }],
      vout: [{ scriptpubkey_address: '1Dust', value: sats - 200 }]
    });
    const seizure = {
      txid: 'c'.repeat(64),
      vin: [{ prevout: { scriptpubkey_address: '1HQ3', value: 6936916716000 } }],
      vout: [{ scriptpubkey_address: 'bc1qgov', value: 6936916628020 }]
    };
    // Newest-first page is all dust; the seizure-shaped tx sits deeper in history.
    const page = [dust('a'.repeat(64), 1096), dust('b'.repeat(64), 2607), seizure];
    const picked = pickSignificantTx(page, '1HQ3');
    expect(picked.tx.txid).toBe(seizure.txid);
    expect(picked.volumeSats).toBe(6936916716000);
    expect(picked.volumeSats).toBeGreaterThanOrEqual(ADDRESS_TRACE_CONFIG.SIGNIFICANT_SATS);
    expect(pickSignificantTx([], '1HQ3')).toBeNull();
  });

  it('walks past dust pages to the significant movement (no unbound config refs)', async () => {
    // Regression lock: the picker must resolve its tuning from
    // constants/config.js — a bare `export ... from` re-export leaves the
    // function body with no local binding and every address search falls
    // back to an offline estimate with "ADDRESS_TRACE_CONFIG is not defined".
    const dustTx = (ch) => ({
      txid: ch.repeat(64),
      vin: [{ prevout: { scriptpubkey_address: '1HQ3', value: 1000 } }],
      vout: [{ scriptpubkey_address: '1Dust', value: 800 }],
      status: { confirmed: true, block_height: 900000, block_time: 1700000000 },
    });
    const bigTx = {
      txid: 'c'.repeat(64),
      vin: [{ prevout: { scriptpubkey_address: '1HQ3', value: 6936916716000 } }],
      vout: [{ scriptpubkey_address: 'bc1qgov', value: 6936916628020 }],
      status: { confirmed: true, block_height: 655283, block_time: 1606780800 },
    };
    vi.stubGlobal('fetch', async (url) => {
      const u = String(url);
      if (u.includes('/txs/chain/')) return { ok: true, json: async () => [bigTx] };
      if (u.includes('/txs')) return { ok: true, json: async () => [dustTx('a'), dustTx('b')] };
      return { ok: false, status: 404, json: async () => ({}) };
    });
    try {
      const found = await findSignificantAddressTx('1HQ3', { minSats: ADDRESS_TRACE_CONFIG.SIGNIFICANT_SATS });
      expect(found.significant).toBe(true);
      expect(found.tx.txid).toBe('c'.repeat(64));
      expect(found.pages).toBe(2);
    } finally {
      vi.unstubAllGlobals();
      clearCache();
    }
  });
});
