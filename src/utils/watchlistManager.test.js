import { describe, it, expect, beforeEach } from 'vitest';
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  checkAddressMempoolStatus,
  normalizeWatchlist,
  makeWatchEntry
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
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].address).toBeDefined();
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

    const updated = removeFromWatchlist(newTarget.address);
    expect(updated.some(w => w.address === newTarget.address)).toBe(false);
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
});
