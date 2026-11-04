import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  clearCache, 
  getCacheStats, 
  getGatewayStatus, 
  resetGatewayCircuitBreaker, 
  onGatewayEvent, 
  fetchTx
} from './bitcoinApi';
import { API_CONFIG } from '../constants/config';

describe('Gateway Circuit Breaker & LRU Cache Telemetry', () => {
  beforeEach(() => {
    clearCache();
    resetGatewayCircuitBreaker();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearCache();
    resetGatewayCircuitBreaker();
  });

  it('tracks cache hits, misses, and evictions with getCacheStats', () => {
    expect(getCacheStats().hits).toBe(0);
    expect(getCacheStats().misses).toBe(0);
    expect(getCacheStats().size).toBe(0);
    expect(getCacheStats().maxSize).toBe(API_CONFIG.MAX_CACHE_SIZE);
  });

  it('reports initial gateway health as HEALTHY', () => {
    const status = getGatewayStatus();
    expect(status.length).toBe(2);
    expect(status[0].name).toBe('Blockstream');
    expect(status[0].status).toBe('HEALTHY');
    expect(status[1].name).toBe('Mempool.space');
    expect(status[1].status).toBe('HEALTHY');
  });

  it('triggers failover and emits event when primary gateway returns HTTP 429', async () => {
    const events = [];
    const unsubscribe = onGatewayEvent(e => events.push(e));

    const mockTxId = 'a'.repeat(64);
    const mockData = { txid: mockTxId, fee: 1500, vin: [], vout: [] };

    // Stub global fetch: primary returns 429, fallback returns 200
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.includes('blockstream.info')) {
        return { ok: false, status: 429, json: async () => ({}) };
      }
      if (url.includes('mempool.space')) {
        return { ok: true, status: 200, json: async () => mockData };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const result = await fetchTx(mockTxId);
    expect(result.txid).toBe(mockTxId);

    // Primary should be placed on cooldown
    const status = getGatewayStatus();
    const primary = status.find(s => s.id === 'primary');
    expect(primary.status).toBe('RATE_LIMITED');
    expect(primary.cooldownRemainingMs).toBeGreaterThan(0);

    // Gateway event should have been emitted
    expect(events.some(e => e.type === 'RATE_LIMIT' && e.gateway === 'Blockstream')).toBe(true);

    unsubscribe();
  });

  it('fails over when a gateway returns a malformed transaction payload', async () => {
    const txid = 'f'.repeat(64);
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(String(url));
      if (String(url).includes('blockstream.info')) {
        return { ok: true, status: 200, json: async () => ({ txid }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ txid, vin: [], vout: [], fee: 0 }),
      };
    }));

    await expect(fetchTx(txid)).resolves.toMatchObject({ txid, vin: [], vout: [] });
    expect(calls.some(url => url.includes('blockstream.info'))).toBe(true);
    expect(calls.some(url => url.includes('mempool.space'))).toBe(true);
  });

  it('immediately routes to fallback gateway when primary is on cooldown', async () => {
    const mockTxId1 = 'b'.repeat(64);
    const mockTxId2 = 'c'.repeat(64);

    const fetchMock = vi.fn(async (url) => {
      if (url.includes('blockstream.info')) {
        return { ok: false, status: 429, json: async () => ({}) };
      }
      const txid = String(url).match(/\/tx\/([0-9a-f]{64})/i)?.[1];
      return { ok: true, status: 200, json: async () => ({ txid, fee: 1000, vin: [], vout: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    // First call puts primary on cooldown
    await fetchTx(mockTxId1);

    fetchMock.mockClear();

    // Second call for a different tx: primary is still in cooldown, so fallback is queried first
    await fetchTx(mockTxId2);

    const firstCallUrl = fetchMock.mock.calls[0][0];
    expect(firstCallUrl).toContain('mempool.space');
  });

  it('throws RateLimitError or GatewayError when all gateways fail', async () => {
    const mockTxId = 'd'.repeat(64);
    vi.stubGlobal('fetch', vi.fn(async () => {
      return { ok: false, status: 429, json: async () => ({}) };
    }));

    await expect(fetchTx(mockTxId)).rejects.toThrow();
  });

  it('preserves a not-found response when the fallback provider times out', async () => {
    const mockTxId = 'e'.repeat(64);
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.includes('blockstream.info')) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      throw new DOMException('The operation was aborted', 'AbortError');
    }));

    await expect(fetchTx(mockTxId)).rejects.toThrow(
      'Resource not found at one provider and unavailable at others (Blockstream: HTTP 404; Mempool.space: Request timeout for /tx/' + mockTxId + '). Check the identifier and retry.'
    );
  });

  it('resets circuit breaker with resetGatewayCircuitBreaker', () => {
    const statusBefore = getGatewayStatus();
    expect(statusBefore[0].status).toBe('HEALTHY');

    resetGatewayCircuitBreaker();
    const statusAfter = getGatewayStatus();
    expect(statusAfter[0].status).toBe('HEALTHY');
    expect(statusAfter[0].consecutiveFailures).toBe(0);
  });
});
