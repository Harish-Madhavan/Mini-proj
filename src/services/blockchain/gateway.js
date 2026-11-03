import { API_CONFIG, ADDRESS_TRACE_CONFIG } from '../../constants/config';
export const apiCache = new Map();

let cacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0
};

export function getCacheStats() {
  return {
    ...cacheStats,
    size: apiCache.size,
    maxSize: API_CONFIG.MAX_CACHE_SIZE,
    ttlMs: API_CONFIG.CACHE_TTL_MS
  };
}

export function clearCache() {
  apiCache.clear();
  cacheStats = { hits: 0, misses: 0, evictions: 0 };
}

function getFromCache(cacheKey) {
  const cached = apiCache.get(cacheKey);
  if (!cached) {
    cacheStats.misses++;
    return null;
  }
  if (Date.now() - cached.timestamp >= API_CONFIG.CACHE_TTL_MS) {
    apiCache.delete(cacheKey);
    cacheStats.misses++;
    return null;
  }
  // True LRU: delete and re-set to refresh insertion order
  apiCache.delete(cacheKey);
  apiCache.set(cacheKey, cached);
  cacheStats.hits++;
  return cached.data;
}

function putInCache(cacheKey, data) {
  if (apiCache.has(cacheKey)) {
    apiCache.delete(cacheKey);
  } else if (apiCache.size >= API_CONFIG.MAX_CACHE_SIZE) {
    const oldestKey = apiCache.keys().next().value;
    if (oldestKey) {
      apiCache.delete(oldestKey);
      cacheStats.evictions++;
    }
  }
  apiCache.set(cacheKey, { timestamp: Date.now(), data });
}

export class RateLimitError extends Error {
  constructor(message = 'Gateway rate-limited (429)', gateway = null, cooldownSec = 60) {
    super(message);
    this.name = 'RateLimitError';
    this.gateway = gateway;
    this.cooldownSec = cooldownSec;
  }
}

export class GatewayError extends Error {
  constructor(message = 'All blockchain gateways unavailable') {
    super(message);
    this.name = 'GatewayError';
  }
}

const gatewayListeners = new Set();

export function onGatewayEvent(listener) {
  if (typeof listener === 'function') {
    gatewayListeners.add(listener);
    return () => gatewayListeners.delete(listener);
  }
  return () => {};
}

function emitGatewayEvent(event) {
  for (const listener of gatewayListeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener error
    }
  }
}

const gateways = [
  {
    id: 'primary',
    name: 'Blockstream',
    baseUrl: API_CONFIG.PRIMARY_BASE_URL,
    status: 'HEALTHY',
    cooldownUntil: 0,
    consecutiveFailures: 0
  },
  {
    id: 'fallback',
    name: 'Mempool.space',
    baseUrl: API_CONFIG.FALLBACK_BASE_URL,
    status: 'HEALTHY',
    cooldownUntil: 0,
    consecutiveFailures: 0
  }
];

export function getGatewayStatus() {
  const now = Date.now();
  return gateways.map(gw => ({
    id: gw.id,
    name: gw.name,
    baseUrl: gw.baseUrl,
    status: gw.cooldownUntil > now ? (gw.status === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'COOLDOWN') : 'HEALTHY',
    cooldownRemainingMs: Math.max(0, gw.cooldownUntil - now),
    consecutiveFailures: gw.consecutiveFailures
  }));
}

export function resetGatewayCircuitBreaker() {
  gateways.forEach(gw => {
    gw.status = 'HEALTHY';
    gw.cooldownUntil = 0;
    gw.consecutiveFailures = 0;
  });
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(tid);
  }
}

async function fetchWithFallbackAndCache(endpoint) {
  if (!endpoint || typeof endpoint !== 'string' || endpoint.length > 200) {
    throw new Error('Invalid API endpoint');
  }
  const cacheKey = endpoint;
  const cachedData = getFromCache(cacheKey);
  if (cachedData !== null) {
    return cachedData;
  }

  const now = Date.now();
  // Sort gateways: healthy gateways first (cooldownUntil <= now), then by earliest cooldown expiry
  const orderedGateways = [...gateways].sort((a, b) => {
    const aCool = a.cooldownUntil > now;
    const bCool = b.cooldownUntil > now;
    if (!aCool && bCool) return -1;
    if (aCool && !bCool) return 1;
    return a.cooldownUntil - b.cooldownUntil;
  });

  let lastError = null;
  for (const gw of orderedGateways) {
    const url = `${gw.baseUrl}${endpoint}`;
    try {
      const response = await fetchWithTimeout(url);
      if (response.ok) {
        const data = await response.json();
        if (gw.consecutiveFailures > 0 || gw.cooldownUntil > 0) {
          emitGatewayEvent({
            type: 'RECOVERED',
            gateway: gw.name,
            endpoint
          });
        }
        gw.status = 'HEALTHY';
        gw.cooldownUntil = 0;
        gw.consecutiveFailures = 0;
        putInCache(cacheKey, data);
        return data;
      } else if (response.status === 429) {
        gw.status = 'RATE_LIMITED';
        gw.cooldownUntil = now + 60000;
        gw.consecutiveFailures++;
        emitGatewayEvent({
          type: 'RATE_LIMIT',
          gateway: gw.name,
          endpoint,
          cooldownSec: 60
        });
        lastError = new RateLimitError(`Rate limited (429) on ${gw.name} - cooldown 60s`, gw.name, 60);
      } else {
        gw.consecutiveFailures++;
        if (gw.consecutiveFailures >= 2) {
          gw.status = 'DEGRADED';
          gw.cooldownUntil = now + 30000;
        }
        emitGatewayEvent({
          type: 'GATEWAY_ERROR',
          gateway: gw.name,
          endpoint,
          status: response.status
        });
        lastError = new Error(`HTTP ${response.status} for ${endpoint}`);
      }
    } catch (err) {
      gw.consecutiveFailures++;
      if (gw.consecutiveFailures >= 2) {
        gw.status = 'DEGRADED';
        gw.cooldownUntil = now + 30000;
      }
      lastError = err.name === 'AbortError' ? new Error(`Request timeout for ${endpoint}`) : err;
      emitGatewayEvent({
        type: 'GATEWAY_TIMEOUT',
        gateway: gw.name,
        endpoint,
        error: lastError.message
      });
    }
  }

  throw lastError || new GatewayError(`Failed to fetch data for ${endpoint}`);
}

export async function fetchTx(txId) {
  if (!/^[0-9a-fA-F]{64}$/.test(txId)) throw new Error('Invalid txId format');
  return fetchWithFallbackAndCache(`/tx/${txId}`);
}

export async function fetchOutspends(txId) {
  if (!/^[0-9a-fA-F]{64}$/.test(txId)) throw new Error('Invalid txId format');
  return fetchWithFallbackAndCache(`/tx/${txId}/outspends`);
}

export async function fetchAddressTxs(address) {
  if (!address || typeof address !== 'string' || address.length > 100) throw new Error('Invalid address');
  return fetchWithFallbackAndCache(`/address/${address}/txs`);
}

/**
 * Next history page (older transactions) after `lastTxid`.
 * Esplora paginates 25 per page; the last txid of the previous page cursors.
 */
export async function fetchAddressTxPage(address, lastTxid) {
  if (!address || typeof address !== 'string' || address.length > 100) throw new Error('Invalid address');
  if (!/^[0-9a-fA-F]{64}$/.test(lastTxid || '')) throw new Error('Invalid lastTxid cursor');
  return fetchWithFallbackAndCache(`/address/${address}/txs/chain/${lastTxid}`);
}

/**
 * Satoshis moved in `tx` where `address` is sender or receiver.
 * Coinbase inputs have no prevout and contribute nothing.
 */
export function addressTxVolumeSats(tx, address) {
  if (!tx || !address) return 0;
  let sats = 0;
  for (const v of (tx.vin || [])) {
    if (v.prevout?.scriptpubkey_address === address) sats += v.prevout.value || 0;
  }
  for (const o of (tx.vout || [])) {
    if (o.scriptpubkey_address === address) sats += o.value || 0;
  }
  return sats;
}

/**
 * Pick the highest-volume transaction involving `address` from a list.
 * Pure â€” the unit-testable core of address-trace selection.
 * @returns {{ tx, volumeSats } | null}
 */
export function pickSignificantTx(txs = [], address) {
  let best = null;
  let bestVol = -1;
  for (const tx of (txs || [])) {
    if (!tx?.txid) continue;
    const vol = addressTxVolumeSats(tx, address);
    if (vol > bestVol) {
      bestVol = vol;
      best = tx;
    }
  }
  return best ? { tx: best, volumeSats: bestVol } : null;
}

/**
 * Address-trace picker tuning lives in constants/config.js
 * (ADDRESS_TRACE_CONFIG, single source â€” never inline).
 */

/**
 * Find the most forensically relevant transaction for an address search.
 * The newest history page of a long-lived address (e.g. 1HQ3, 274 txs) is
 * often dust â€” tracing `txs[0]` builds a graph of thousand-sat tribute
 * outputs instead of the seizure. Walk back while the best candidate is
 * still dust-sized; fall back to the newest tx when nothing significant
 * turns up within MAX_PAGES.
 *
 * @returns {Promise<{ tx, volumeSats, firstPage, scanned, pages, significant }>}
 */
export async function findSignificantAddressTx(address, opts = {}) {
  const maxPages = Number.isFinite(opts.maxPages) && opts.maxPages > 0 ? Math.min(20, Math.floor(opts.maxPages)) : ADDRESS_TRACE_CONFIG.MAX_PAGES;
  const minSats = Number.isFinite(opts.minSats) && opts.minSats >= 0 ? opts.minSats : ADDRESS_TRACE_CONFIG.SIGNIFICANT_SATS;

  const firstPage = await fetchAddressTxs(address);
  if (!firstPage || firstPage.length === 0) {
    return { tx: null, volumeSats: 0, firstPage: [], scanned: 0, pages: 0, significant: false };
  }
  let best = pickSignificantTx(firstPage, address);
  let scanned = firstPage.length;
  let pages = 1;
  let lastTxid = firstPage[firstPage.length - 1].txid;

  while (best && best.volumeSats < minSats && pages < maxPages) {
    let page = null;
    try {
      page = await fetchAddressTxPage(address, lastTxid);
    } catch {
      break;
    }
    if (!page || page.length === 0) break;
    pages += 1;
    scanned += page.length;
    const candidate = pickSignificantTx(page, address);
    if (candidate && candidate.volumeSats > best.volumeSats) best = candidate;
    lastTxid = page[page.length - 1].txid;
    if (page.length < 25) break;
  }

  return {
    tx: best?.tx || null,
    volumeSats: best?.volumeSats || 0,
    firstPage,
    scanned,
    pages,
    significant: (best?.volumeSats || 0) >= minSats,
  };
}

/**
 * Batch address summaries (chain stats) for chain-reuse scoring, with the
 * same bounded parallelism as transaction batches. Never throws: failures
 * degrade to missing entries, which the scorer treats as no-signal.
 * @returns {Promise<Map<string, object>>} address -> /address summary
 */
export async function fetchAddressSummaries(addresses = [], concurrency = 5) {
  const unique = [...new Set((addresses || []).filter(a => typeof a === 'string' && a))];
  const out = new Map();
  for (let i = 0; i < unique.length; i += concurrency) {
    const chunk = unique.slice(i, i + concurrency);
    const settled = await Promise.all(chunk.map(async (addr) => {
      try {
        return [addr, await fetchAddressSummary(addr)];
      } catch {
        return [addr, null];
      }
    }));
    for (const [addr, summary] of settled) {
      if (summary) out.set(addr, summary);
    }
  }
  return out;
}

/**
 * Display labels for endpoint activity profiles (single source for all views).
 */
export const ENDPOINT_PROFILE_LABELS = {
  SINGLE_USE_DEPOSIT: 'Single-use deposit',
  DRAINED_PASS_THROUGH: 'Drained pass-through',
  ACTIVE_REUSED_WALLET: 'Active reused wallet',
  DORMANT_HOLDER: 'Dormant holder',
  UNPROFILED: 'Unprofiled',
};

/**
 * Chain + mempool stats for one address (funded/spent sums and counts).
 * Cached like all gateway reads; powers end-receiver endpoint profiling.
 */
export async function fetchAddressSummary(address) {
  if (!address || typeof address !== 'string' || address.length > 100) throw new Error('Invalid address');
  return fetchWithFallbackAndCache(`/address/${address}`);
}

/**
 * Classify what KIND of endpoint an address is from its on-chain footprint.
 * Pure function of the /address summary: no network, fully testable.
 *
 * Profiles: SINGLE_USE_DEPOSIT (funded once or twice, never spent â€” the
 * classic one-time deposit / ransom drop), DRAINED_PASS_THROUGH (everything
 * received has moved on â€” follow the spends, not this address),
 * ACTIVE_REUSED_WALLET (ongoing two-way activity), DORMANT_HOLDER (funded,
 * unspent, but the funding is old/multi-tx), UNPROFILED (no data).
 * isAggregator flags addresses that absorbed 5+ separate funding outputs â€”
 * consolidation points worth clustering regardless of profile.
 */
export function classifyEndpointActivity(summary) {
  const empty = { profile: 'UNPROFILED', txCount: 0, totalReceivedSats: 0, balanceSats: 0, isAggregator: false, hasMempoolActivity: false };
  const chain = summary?.chain_stats;
  if (!chain) return empty;
  const fundedCount = chain.funded_txo_count || 0;
  const fundedSum = chain.funded_txo_sum || 0;
  const spentSum = chain.spent_txo_sum || 0;
  const txCount = chain.tx_count || 0;
  const balance = Math.max(0, fundedSum - spentSum);
  const mempool = summary?.mempool_stats;
  const hasMempoolActivity = ((mempool?.tx_count || 0) > 0) || ((mempool?.funded_txo_count || 0) > 0) || ((mempool?.spent_txo_count || 0) > 0);
  const base = {
    txCount,
    totalReceivedSats: fundedSum,
    balanceSats: balance,
    isAggregator: fundedCount >= 5,
    hasMempoolActivity,
  };
  if (fundedCount === 0) return { ...base, profile: 'UNPROFILED' };
  if (balance === 0) return { ...base, profile: 'DRAINED_PASS_THROUGH' };
  if (fundedCount <= 2 && spentSum === 0) return { ...base, profile: 'SINGLE_USE_DEPOSIT' };
  if (txCount >= 10 || fundedCount >= 5) return { ...base, profile: 'ACTIVE_REUSED_WALLET' };
  return { ...base, profile: 'DORMANT_HOLDER' };
}


