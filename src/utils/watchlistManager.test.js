import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  removeManyFromWatchlist,
  checkAddressMempoolStatus,
  normalizeWatchlist,
  makeWatchEntry,
  getWebSocketStatus,
  onMempoolAlert,
  emitMempoolAlert,
  getMempoolAlerts,
  mergeMempoolAlerts,
  initMempoolWebSocket,
  closeMempoolWebSocket,
} from './watchlistManager';


describe('watchlistManager', () => {
  let mockStore = {};

  beforeEach(() => {
    mockStore = {};
    global.localStorage = {
      getItem: (k) => mockStore[k] || null,
      setItem: (k, v) => { mockStore[k] = String(v); },
      removeItem: (k) => { delete mockStore[k]; },
      clear: () => { mockStore = {}; }
    };
  });

  it('retrieves default watchlist when empty', () => {
    const list = getWatchlist();
    expect(list).toEqual([]);
  });

  it('migrates legacy string entries to objects', () => {
    const migrated = normalizeWatchlist(['bc1qmigrate1', 'bc1qmigrate1', null, 42, '  ']);
    expect(migrated.length).toBe(1);
    expect(migrated[0].address).toBe('bc1qmigrate1');
    expect(migrated[0].tag).toBeTruthy();
  });

  it('builds entries with defaults that empty overrides cannot clobber', () => {
    const entry = makeWatchEntry('bc1qfactory', { tag: '', notes: undefined });
    expect(entry.address).toBe('bc1qfactory');
    expect(entry.tag).toBe('Watched wallet');
    expect(entry.notes).toBe('Added for monitoring.');
    expect(makeWatchEntry('bc1qfactory', { tag: 'Custom' }).tag).toBe('Custom');
  });

  it('caps the watchlist at 100 entries', () => {
    for (let i = 0; i < 100; i++) {
      addToWatchlist({ address: `bc1qcapfill${i}` });
    }
    const full = addToWatchlist({ address: 'bc1qoneover' });
    expect(full.success).toBe(false);
    expect(full.message).toContain('full');
  });

  it('adds and removes a target address cleanly', () => {
    const newTarget = {
      address: 'bc1qtestmonitoredtargetaddress123',
      tag: 'Suspect Cache',
      riskTier: 'CRITICAL'
    };
    const addRes = addToWatchlist(newTarget);
    expect(addRes.success).toBe(true);
    expect(getWatchlist().some(w => w.address === newTarget.address)).toBe(true);

    const result = removeFromWatchlist(newTarget.address);
    expect(result.success).toBe(true);
    expect(result.watchlist.some(w => w.address === newTarget.address)).toBe(false);
  });

  it('removes selected watchlist addresses with one persisted update', () => {
    addToWatchlist({ address: 'bc1qbulkone' });
    addToWatchlist({ address: 'bc1qbulktwo' });
    addToWatchlist({ address: 'bc1qkeep' });

    const result = removeManyFromWatchlist(['BC1Qbulkone', 'bc1qbulktwo', 'not-present']);

    expect(result).toMatchObject({ success: true, removedCount: 2 });
    expect(result.watchlist.map(entry => entry.address)).toEqual(['bc1qkeep']);
    expect(removeManyFromWatchlist([])).toMatchObject({
      success: false,
      message: 'Select at least one watched address.'
    });
  });

  it('does not report a bulk removal as successful when storage writes fail', () => {
    addToWatchlist({ address: 'bc1qbulkstorage' });
    global.localStorage.setItem = () => { throw new DOMException('storage full', 'QuotaExceededError'); };

    expect(removeManyFromWatchlist(['bc1qbulkstorage'])).toMatchObject({
      success: false,
      message: 'Could not save the updated watchlist in browser storage.'
    });
  });

  it('does not report a watchlist change as successful when storage writes fail', () => {
    global.localStorage.setItem = () => { throw new DOMException('storage full', 'QuotaExceededError'); };

    const added = addToWatchlist({ address: 'bc1qstoragefailuretarget' });
    expect(added).toMatchObject({
      success: false,
      message: 'Could not save the watchlist in browser storage.',
    });

    const removed = removeFromWatchlist('bc1qstoragefailuretarget');
    expect(removed).toMatchObject({
      success: false,
      message: 'Could not save the updated watchlist in browser storage.',
    });
  });

  it('preserves an explicitly empty saved watchlist', () => {
    mockStore.aegistrace_watchlist = '[]';
    expect(getWatchlist()).toEqual([]);
  });

  it('prevents duplicate address additions', () => {
    const target = { address: 'bc1qduplicatecheckaddress' };
    addToWatchlist(target);
    const dupeRes = addToWatchlist(target);
    expect(dupeRes.success).toBe(false);
    expect(dupeRes.message).toContain('already');
  });

  it('checks address mempool status in sandbox mode', async () => {
    const status = await checkAddressMempoolStatus('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', false);
    expect(status).toHaveProperty('hasMempoolTx');
  });

  it('keeps live empty responses distinct from simulated activity', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => [] });
    try {
      const status = await checkAddressMempoolStatus('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', true);
      expect(status.status).toBe('clear');
      expect(status.hasMempoolTx).toBe(false);
      expect(status.txid).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('counts only the watched address flow in a live transaction', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => [{
      txid: 'a'.repeat(64),
      vin: [],
      vout: [
        { scriptpubkey_address: 'bc1qotheraddress', value: 90000000 },
        { scriptpubkey_address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', value: 25000000 }
      ]
    }] });
    try {
      const status = await checkAddressMempoolStatus('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', true);
      expect(status.status).toBe('activity');
      expect(status.hasMempoolTx).toBe(true);
      expect(status.amount).toContain('0.2500 BTC');
      expect(status.feeRate).toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('does not present malformed live responses as quiet or fabricate a fee rate', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => [{
        txid: 'invalid-txid',
        vin: [],
        vout: [{ scriptpubkey_address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', value: 25000000 }],
      }],
    });
    try {
      const status = await checkAddressMempoolStatus('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', true);
      expect(status).toMatchObject({
        status: 'unavailable',
        hasMempoolTx: false,
        message: 'Data source returned an invalid response.',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns an unavailable result on live lookup failures', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => { throw new Error('network down'); };
    try {
      const status = await checkAddressMempoolStatus('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', true);
      expect(status.status).toBe('unavailable');
      expect(status.hasMempoolTx).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('manages real-time mempool WebSocket alerts and status listeners', () => {
    expect(['DISCONNECTED', 'CONNECTING', 'CONNECTED', 'UNSUPPORTED', 'ERROR']).toContain(getWebSocketStatus());

    let receivedAlert = null;
    const unsubscribe = onMempoolAlert((alert) => {
      receivedAlert = alert;
    });

    const testAlert = {
      id: 'test_alert_001',
      address: 'bc1qtesttarget',
      txid: '00112233445566778899aabbccddeeff',
      feeRate: '22 sat/vB',
      amount: '1.5000 BTC',
      type: '0-Conf Push'
    };

    emitMempoolAlert(testAlert);

    expect(receivedAlert).not.toBeNull();
    expect(receivedAlert.txid).toBe(testAlert.txid);

    const savedAlerts = getMempoolAlerts();
    expect(savedAlerts.some(a => a.txid === testAlert.txid)).toBe(true);

    unsubscribe();
  });

  it('deduplicates alerts per watched address and transaction, not transaction alone', () => {
    const first = {
      id: 'alert-first',
      address: 'bc1qfirst',
      txid: 'a'.repeat(64),
      amount: '0.1 BTC',
    };
    const secondAddressSameTx = {
      id: 'alert-second',
      address: 'bc1qsecond',
      txid: 'a'.repeat(64),
      amount: '0.2 BTC',
    };

    expect(emitMempoolAlert(first)).toBe(true);
    expect(emitMempoolAlert(secondAddressSameTx)).toBe(true);
    expect(emitMempoolAlert({ ...first, id: 'duplicate-first' })).toBe(false);
    expect(getMempoolAlerts().map(alert => alert.address)).toEqual(['bc1qsecond', 'bc1qfirst']);
    expect(mergeMempoolAlerts([first], [secondAddressSameTx])).toHaveLength(2);
  });

  it('ignores malformed saved alert collections', () => {
    mockStore.aegistrace_mempool_alerts = JSON.stringify({ txid: 'not-an-alert-list' });
    expect(getMempoolAlerts()).toEqual([]);
    mockStore.aegistrace_mempool_alerts = JSON.stringify([null, 'invalid', { id: 'legacy-alert' }]);
    expect(getMempoolAlerts()).toEqual([{ id: 'legacy-alert' }]);
  });

  it('does not reconnect after an intentional WebSocket close', () => {
    const OriginalWebSocket = window.WebSocket;
    const instances = [];
    class MockWebSocket {
      static OPEN = 1;
      static CONNECTING = 0;
      readyState = MockWebSocket.CONNECTING;
      send = vi.fn();
      constructor() {
        instances.push(this);
      }
      close() {
        this.readyState = 3;
        this.onclose?.();
      }
    }

    vi.useFakeTimers();
    window.WebSocket = MockWebSocket;
    try {
      const socket = initMempoolWebSocket();
      socket.readyState = 3;
      socket.onclose();
      closeMempoolWebSocket();
      vi.advanceTimersByTime(5000);
      expect(instances).toHaveLength(1);
      expect(getWebSocketStatus()).toBe('DISCONNECTED');
    } finally {
      closeMempoolWebSocket();
      window.WebSocket = OriginalWebSocket;
      vi.useRealTimers();
    }
  });

  it('reconnects after an unexpected WebSocket disconnect', () => {
    const OriginalWebSocket = window.WebSocket;
    const instances = [];
    class MockWebSocket {
      static OPEN = 1;
      static CONNECTING = 0;
      readyState = MockWebSocket.CONNECTING;
      send = vi.fn();
      constructor() {
        instances.push(this);
      }
      close() {
        this.readyState = 3;
        this.onclose?.();
      }
    }

    vi.useFakeTimers();
    window.WebSocket = MockWebSocket;
    try {
      const socket = initMempoolWebSocket();
      socket.readyState = 3;
      socket.onclose();
      vi.advanceTimersByTime(5000);
      expect(instances).toHaveLength(2);
      expect(getWebSocketStatus()).toBe('CONNECTING');
    } finally {
      closeMempoolWebSocket();
      window.WebSocket = OriginalWebSocket;
      vi.useRealTimers();
    }
  });
});
