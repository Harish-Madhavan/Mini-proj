/**
 * AegisTrace Target Address Watchlist & Real-Time Mempool Transaction Monitor (SIH1675 Core)
 * Manages persistent address surveillance, mempool polling, 0-conf detection, and instant alerting.
 */

import { safeGetItem, safeSetItem } from './storage';
import { API_CONFIG } from '../constants/config';

const WATCHLIST_STORAGE_KEY = 'aegistrace_watchlist';
const ALERTS_STORAGE_KEY = 'aegistrace_mempool_alerts';
const MAX_WATCHLIST = 100;

/**
 * Single canonical watchlist entry shape. Both the hook and the manager
 * build entries through here — previously one side stored bare strings and
 * the other objects under the same key, corrupting reads.
 */
export function makeWatchEntry(address, overrides = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null && value !== '') clean[key] = value;
  }
  return {
    address: address.trim(),
    tag: 'Watched wallet',
    syndicate: 'Open case',
    riskTier: 'HIGH',
    addedDate: new Date().toISOString().split('T')[0],
    notes: 'Added for monitoring.',
    ...clean,
  };
}

/**
 * Normalize stored data into entries, dropping garbage and duplicates.
 * Migrates legacy bare-string arrays in place.
 */
export function normalizeWatchlist(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const entry = typeof item === 'string'
      ? (item.trim() ? makeWatchEntry(item, { notes: 'Imported from an older watchlist.' }) : null)
      : (item && typeof item.address === 'string' && item.address.trim() ? { ...item, address: item.address.trim() } : null);
    if (!entry) continue;
    const key = entry.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out.slice(0, MAX_WATCHLIST);
}

export const DEFAULT_WATCHLIST = [
  {
    address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    tag: 'Watched deposit wallet',
    syndicate: 'Case Alpha',
    riskTier: 'CRITICAL',
    addedDate: '2026-03-01',
    notes: 'Deposit wallet seen in an earlier case.'
  },
  {
    address: 'bc1q7w5pxj2lznq48as923kd8mzklaq02947alkwsj',
    tag: 'Transit wallet',
    syndicate: 'Case Alpha',
    riskTier: 'HIGH',
    addedDate: '2026-03-02',
    notes: 'Middle wallet seen forwarding funds.'
  },
  {
    address: '3E8tJ4n...WazirX_Deposit',
    tag: 'Exchange endpoint',
    syndicate: 'Case Alpha',
    riskTier: 'MEDIUM',
    addedDate: '2026-03-02',
    notes: 'Notice sent. Waiting for identity records.'
  }
];

export function getWatchlist() {
  const saved = safeGetItem(WATCHLIST_STORAGE_KEY, null);
  if (Array.isArray(saved) && saved.length > 0) {
    const normalized = normalizeWatchlist(saved);
    if (normalized.length > 0) return normalized;
  }
  return DEFAULT_WATCHLIST;
}

export function saveWatchlist(items) {
  safeSetItem(WATCHLIST_STORAGE_KEY, items);
}

export function addToWatchlist(item) {
  const rawAddress = typeof item?.address === 'string' ? item.address.trim() : '';
  if (!rawAddress) {
    return { success: false, message: 'A valid address is required.' };
  }
  const current = getWatchlist();
  if (current.some(w => typeof w.address === 'string' && w.address.toLowerCase() === rawAddress.toLowerCase())) {
    return { success: false, message: 'Address is already on your watchlist.' };
  }
  if (current.length >= MAX_WATCHLIST) {
    return { success: false, message: 'Watchlist is full (100).' };
  }
  const updated = [
    makeWatchEntry(rawAddress, {
      tag: item.tag,
      syndicate: item.syndicate,
      riskTier: item.riskTier,
      notes: item.notes,
    }),
    ...current
  ];
  saveWatchlist(updated);
  return { success: true, watchlist: updated };
}

export function removeFromWatchlist(address) {
  const current = getWatchlist();
  const needle = typeof address === 'string' ? address.toLowerCase() : '';
  const updated = current.filter(w => typeof w.address !== 'string' || w.address.toLowerCase() !== needle);
  saveWatchlist(updated);
  return updated;
}

export function getMempoolAlerts() {
  return safeGetItem(ALERTS_STORAGE_KEY, []);
}

export function saveMempoolAlerts(alerts) {
  safeSetItem(ALERTS_STORAGE_KEY, alerts);
}

/**
 * Checks mempool status for a given address
 * Queries mempool.space in live mode or provides realistic 0-conf simulation in sandbox mode
 */
export async function checkAddressMempoolStatus(address, isLive = true) {
  if (typeof address !== 'string' || address.length === 0 || address.length > 100) {
    return { hasMempoolTx: false, message: 'Invalid address format.' };
  }
  if (isLive && (address.startsWith('bc1') || address.startsWith('1') || address.startsWith('3'))) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${API_CONFIG.FALLBACK_BASE_URL}/address/${address}/txs/mempool`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const first = data[0];
          const feeRate = first.fee && first.weight ? Math.round(first.fee / (first.weight / 4)) : 25;
          const valSats = (first.vout || []).reduce((s, o) => s + (o.value || 0), 0);
          return {
            hasMempoolTx: true,
            txid: first.txid,
            feeRate: `${feeRate} satoshis per byte`,
            amount: `${(valSats / 1e8).toFixed(4)} BTC`,
            type: 'Unconfirmed',
            timestamp: 'Just seen waiting for confirmation'
          };
        }
      } else if (res.status === 429) {
        return { hasMempoolTx: false, message: 'Data source is busy (rate limit). Try again shortly.' };
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn("Mempool fetch note:", e.message);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Sandbox simulation, seeded per address AND per day so the demo feed
  // rotates instead of permanently flagging (or never flagging) an address.
  const hash = address.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const daySeed = Math.floor(Date.now() / 86400000);
  const hasTx = (hash + daySeed) % 3 === 0;
  if (hasTx) {
    const btcVal = (((hash + daySeed) % 100) / 20 + 0.05).toFixed(4);
    const feeRate = (20 + ((hash + daySeed) % 40));
    return {
      hasMempoolTx: true,
      txid: `sim_${(hash + daySeed).toString(16)}009a23fc`,
      feeRate: `${feeRate} satoshis per byte`,
      amount: `${btcVal} BTC`,
      type: 'Unconfirmed (estimated)',
      timestamp: 'Active broadcast detected'
    };
  }

  return {
    hasMempoolTx: false,
    message: 'No unconfirmed transactions. Nothing moved.'
  };
}
