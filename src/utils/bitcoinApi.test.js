import { describe, it, expect, beforeEach } from 'vitest';
import { 
  apiCache, 
  clearCache, 
  formatBlockstreamTx, 
  getScriptTypeFromAddress, 
  parseOpReturnPayload, 
  isCoinJoinTransaction 
} from './bitcoinApi';
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
    expect(txNode.details.feeRateSatVb).toContain('sat/vB');
    expect(txNode.details.rbfStatus).toBe('RBF Enabled');
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

  it('should detect CoinJoin privacy mixing transactions', () => {
    const coinJoinTx = {
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
});
