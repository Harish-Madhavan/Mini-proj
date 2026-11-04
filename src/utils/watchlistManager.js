/**
 * AegisTrace Target Address Watchlist & Real-Time Mempool Transaction Monitor (SIH1675 Core)
 * Manages persistent address surveillance, mempool polling, 0-conf detection, and instant alerting.
 */

import { safeGetItem, safeSetItem } from './storage';
import { API_CONFIG } from '../constants/config';
import { validateBtcAddress } from './forensicUtils';

const WATCHLIST_STORAGE_KEY = 'aegistrace_watchlist';
const ALERTS_STORAGE_KEY = 'aegistrace_mempool_alerts';
export const MAX_WATCHLIST = 100;

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
    riskTier: 'UNASSESSED',
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

// Start empty. Demo or imported addresses must be explicitly added by the user.
export const DEFAULT_WATCHLIST = [];

export function getWatchlist() {
  const saved = safeGetItem(WATCHLIST_STORAGE_KEY, null);
  if (Array.isArray(saved)) {
    const normalized = normalizeWatchlist(saved);
    return normalized;
  }
  return DEFAULT_WATCHLIST;
}

export function saveWatchlist(items) {
  return safeSetItem(WATCHLIST_STORAGE_KEY, normalizeWatchlist(items));
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
  if (!saveWatchlist(updated)) {
    return { success: false, message: 'Could not save the watchlist in browser storage.' };
  }
  return { success: true, watchlist: updated };
}

export function removeFromWatchlist(address) {
  const current = getWatchlist();
  const needle = typeof address === 'string' ? address.toLowerCase() : '';
  const updated = current.filter(w => typeof w.address !== 'string' || w.address.toLowerCase() !== needle);
  if (!saveWatchlist(updated)) {
    return { success: false, message: 'Could not save the updated watchlist in browser storage.' };
  }
  return { success: true, watchlist: updated };
}

export function removeManyFromWatchlist(addresses) {
  const targets = new Set(
    (Array.isArray(addresses) ? addresses : [])
      .filter(address => typeof address === 'string')
      .map(address => address.toLowerCase())
  );
  if (!targets.size) {
    return { success: false, message: 'Select at least one watched address.' };
  }
  const current = getWatchlist();
  const updated = current.filter(entry => !targets.has(entry.address.toLowerCase()));
  const removedCount = current.length - updated.length;
  if (!saveWatchlist(updated)) {
    return { success: false, message: 'Could not save the updated watchlist in browser storage.' };
  }
  return { success: true, watchlist: updated, removedCount };
}

export function getMempoolAlerts() {
  const saved = safeGetItem(ALERTS_STORAGE_KEY, []);
  return Array.isArray(saved)
    ? saved.filter(alert => alert && typeof alert === 'object' && alertIdentity(alert))
    : [];
}

export function saveMempoolAlerts(alerts) {
  return safeSetItem(ALERTS_STORAGE_KEY, mergeMempoolAlerts(alerts, [], 50));
}

function alertIdentity(alert) {
  if (typeof alert?.address === 'string' && typeof alert?.txid === 'string') {
    return `${alert.address.toLowerCase()}:${alert.txid.toLowerCase()}`;
  }
  return typeof alert?.id === 'string' ? `id:${alert.id}` : null;
}

export function mergeMempoolAlerts(incoming, existing = [], limit = 50) {
  const merged = [];
  const seen = new Set();
  for (const alert of [...(Array.isArray(incoming) ? incoming : []), ...(Array.isArray(existing) ? existing : [])]) {
    const identity = alertIdentity(alert);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    merged.push(alert);
    if (merged.length >= limit) break;
  }
  return merged;
}

/**
 * Checks mempool status for a given address
 * Queries mempool.space in live mode or provides realistic 0-conf simulation in sandbox mode
 */
export async function checkAddressMempoolStatus(address, isLive = true) {
  if (typeof address !== 'string' || address.length === 0 || address.length > 100) {
    return { status: 'unavailable', hasMempoolTx: false, message: 'Invalid address format.' };
  }
  const isBitcoinAddress = validateBtcAddress(address).isValid;
  if (isLive && !isBitcoinAddress) {
    return { status: 'unavailable', hasMempoolTx: false, message: 'Live mempool checks support Bitcoin addresses only.' };
  }
  if (isLive) {
    const providers = [API_CONFIG.PRIMARY_BASE_URL, API_CONFIG.FALLBACK_BASE_URL];
    let lastFailure = 'Public mempool providers could not be reached.';

    for (const baseUrl of providers) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`${baseUrl}/address/${address}/txs/mempool`, { signal: controller.signal });
        if (!res.ok) {
          lastFailure = res.status === 429
            ? 'A public provider is rate-limited.'
            : `A public provider returned HTTP ${res.status}.`;
          continue;
        }

        const data = await res.json();
        if (!Array.isArray(data) || !data.every(isValidMempoolTransaction)) {
          lastFailure = 'A public provider returned an invalid response.';
          continue;
        }

        const matching = data.map(tx => ({ tx, flow: getAddressFlow(tx, address) })).find(item => item.flow.amountSats > 0);
        if (!matching) {
          return { status: 'clear', hasMempoolTx: false, message: 'No unconfirmed transactions involving this address.' };
        }

        const { tx: first, flow } = matching;
        const feeRate = Number.isFinite(first.fee) && Number.isFinite(first.weight) && first.weight > 0
          ? Math.round(first.fee / (first.weight / 4))
          : null;
        return {
          status: 'activity',
          hasMempoolTx: true,
          txid: first.txid,
          feeRate: feeRate === null ? null : `${feeRate} satoshis per byte`,
          amount: `${(flow.amountSats / 1e8).toFixed(4)} BTC`,
          direction: flow.direction,
          type: 'Unconfirmed',
          timestamp: 'Just seen waiting for confirmation'
        };
      } catch (error) {
        lastFailure = error.name === 'AbortError'
          ? 'A public provider timed out.'
          : 'A public provider could not be reached.';
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return { status: 'unavailable', hasMempoolTx: false, message: `Live mempool lookup failed. ${lastFailure} Try again later or check your connection.` };
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
      status: 'activity',
      hasMempoolTx: true,
      txid: `sim_${(hash + daySeed).toString(16)}009a23fc`,
      feeRate: `${feeRate} satoshis per byte`,
      amount: `${btcVal} BTC`,
      type: 'Unconfirmed (estimated)',
      timestamp: 'Active broadcast detected'
    };
  }

  return {
    status: 'clear',
    hasMempoolTx: false,
    message: 'No unconfirmed transactions. Nothing moved.'
  };
}

function isValidMempoolTransaction(tx) {
  if (!tx || typeof tx !== 'object' ||
      typeof tx.txid !== 'string' || !/^[0-9a-f]{64}$/i.test(tx.txid) ||
      !Array.isArray(tx.vin) || !Array.isArray(tx.vout)) return false;
  if (tx.fee !== undefined && (!Number.isSafeInteger(tx.fee) || tx.fee < 0)) return false;
  if (tx.weight !== undefined && (!Number.isSafeInteger(tx.weight) || tx.weight <= 0)) return false;
  const validValue = value => Number.isSafeInteger(value) && value >= 0;
  return tx.vout.every(output =>
    output && typeof output === 'object' &&
    validValue(output.value) &&
    (output.scriptpubkey_address === undefined || output.scriptpubkey_address === null ||
      typeof output.scriptpubkey_address === 'string')
  ) && tx.vin.every(input =>
    input && typeof input === 'object' &&
    (input.prevout === undefined || input.prevout === null ||
      (typeof input.prevout === 'object' &&
        (input.prevout.value === undefined || validValue(input.prevout.value)) &&
        (input.prevout.scriptpubkey_address === undefined || input.prevout.scriptpubkey_address === null ||
          typeof input.prevout.scriptpubkey_address === 'string')))
  );
}

function getAddressFlow(tx, address) {
  const needle = address.toLowerCase();
  const receivedSats = (tx?.vout || []).reduce((sum, output) =>
    sum + ((output.scriptpubkey_address || '').toLowerCase() === needle ? output.value || 0 : 0), 0);
  const spentSats = (tx?.vin || []).reduce((sum, input) =>
    sum + ((input.prevout?.scriptpubkey_address || '').toLowerCase() === needle ? input.prevout?.value || 0 : 0), 0);
  if (receivedSats > 0 && spentSats > 0) return { amountSats: Math.max(receivedSats, spentSats), direction: 'self-transfer/mixed' };
  return receivedSats > 0
    ? { amountSats: receivedSats, direction: 'received' }
    : { amountSats: spentSats, direction: 'sent' };
}

let activeWs = null;
let wsStatus = 'DISCONNECTED';
let reconnectTimer = null;
let reconnectEnabled = false;
let connectionGeneration = 0;
const alertListeners = new Set();
const statusListeners = new Set();

export function getWebSocketStatus() {
  return wsStatus;
}

export function onMempoolAlert(listener) {
  if (typeof listener === 'function') {
    alertListeners.add(listener);
    return () => alertListeners.delete(listener);
  }
  return () => {};
}

export function onMempoolStatusChange(listener) {
  if (typeof listener === 'function') {
    statusListeners.add(listener);
    listener(wsStatus);
    return () => statusListeners.delete(listener);
  }
  return () => {};
}

function setWsStatus(status) {
  wsStatus = status;
  statusListeners.forEach(fn => {
    try { fn(status); } catch {}
  });
}

export function emitMempoolAlert(alert) {
  const currentAlerts = getMempoolAlerts();
  const identity = alertIdentity(alert);
  if (!identity) return false;
  if (currentAlerts.some(existing => alertIdentity(existing) === identity)) return false;
  const updated = mergeMempoolAlerts([alert], currentAlerts, 50);
  saveMempoolAlerts(updated);

  alertListeners.forEach(fn => {
    try { fn(alert); } catch {}
  });
  return true;
}

/**
 * Initializes real-time WebSocket connection to mempool.space live stream.
 */
export function refreshMempoolAddressTracking() {
  if (!activeWs || typeof window === 'undefined' || activeWs.readyState !== window.WebSocket.OPEN) return false;
  const addresses = [...new Set(getWatchlist()
    .map(item => item.address)
    .filter(address => validateBtcAddress(address).isValid))].slice(0, MAX_WATCHLIST);
  if (!addresses.length) return false;
  try {
    activeWs.send(JSON.stringify({ 'track-addresses': addresses }));
    return true;
  } catch {
    return false;
  }
}

/** Subscribe to address-specific mempool events for the current watchlist. */
export function initMempoolWebSocket({ wsUrl = 'wss://mempool.space/api/v1/ws', autoReconnect = true } = {}) {
  if (typeof window === 'undefined' || typeof window.WebSocket === 'undefined') {
    setWsStatus('UNSUPPORTED');
    return null;
  }

  reconnectEnabled = true;
  if (activeWs && (activeWs.readyState === window.WebSocket.OPEN || activeWs.readyState === window.WebSocket.CONNECTING)) {
    refreshMempoolAddressTracking();
    return activeWs;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  setWsStatus('CONNECTING');

  try {
    const ws = new window.WebSocket(wsUrl);
    const generation = ++connectionGeneration;
    activeWs = ws;

    ws.onopen = () => {
      if (activeWs !== ws || generation !== connectionGeneration) return;
      setWsStatus('CONNECTED');
      refreshMempoolAddressTracking();
    };

    ws.onmessage = (event) => {
      if (activeWs !== ws || generation !== connectionGeneration) return;
      try {
        const message = JSON.parse(event.data);
        const watched = getWatchlist()
          .map(item => item.address)
          .filter(address => validateBtcAddress(address).isValid);
        if (!watched.length) return;

        const observed = [];
        if (Array.isArray(message['address-transactions'])) {
          observed.push(...message['address-transactions'].map(tx => ({ tx, hintedAddress: null })));
        }
        for (const [address, activity] of Object.entries(message['multi-address-transactions'] || {})) {
          if (!watched.some(item => item.toLowerCase() === address.toLowerCase())) continue;
          observed.push(...(activity?.mempool || []).map(tx => ({ tx, hintedAddress: address })));
        }

        for (const { tx, hintedAddress } of observed) {
          if (!isValidMempoolTransaction(tx) || tx.status?.confirmed === true) continue;
          const candidates = hintedAddress ? [hintedAddress] : watched;
          const address = candidates.find(candidate => getAddressFlow(tx, candidate).amountSats > 0);
          if (!address) continue;
          const flow = getAddressFlow(tx, address);
          const feeRate = tx.fee && tx.weight ? Math.round(tx.fee / (tx.weight / 4)) : null;
          emitMempoolAlert({
            id: `alert_${tx.txid}_${Date.now()}`,
            address,
            txid: tx.txid,
            feeRate: feeRate == null ? 'Unavailable' : `${feeRate} sat/vB`,
            amount: `${(flow.amountSats / 1e8).toFixed(4)} BTC`,
            direction: flow.direction,
            type: 'Unconfirmed address transaction (WebSocket)',
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.warn('Ignoring malformed mempool WebSocket message:', error);
      }
    };

    ws.onerror = () => {
      if (activeWs === ws && generation === connectionGeneration) setWsStatus('ERROR');
    };
    ws.onclose = () => {
      if (activeWs !== ws || generation !== connectionGeneration) return;
      setWsStatus('DISCONNECTED');
      activeWs = null;
      if (autoReconnect && reconnectEnabled) {
        const closedGeneration = generation;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (reconnectEnabled && connectionGeneration === closedGeneration) {
            initMempoolWebSocket({ wsUrl, autoReconnect });
          }
        }, 5000);
      }
    };
    return ws;
  } catch (error) {
    setWsStatus('ERROR');
    console.warn('Could not initialize mempool WebSocket:', error);
    return null;
  }
}
export function closeMempoolWebSocket() {
  reconnectEnabled = false;
  connectionGeneration++;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (activeWs) {
    const ws = activeWs;
    activeWs = null;
    try { ws.close(); } catch (error) {
      console.warn('Could not close mempool WebSocket:', error);
    }
  }
  setWsStatus('DISCONNECTED');
}
