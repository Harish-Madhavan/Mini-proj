import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getWatchlist, 
  addToWatchlist, 
  removeFromWatchlist, 
  checkAddressMempoolStatus 
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
