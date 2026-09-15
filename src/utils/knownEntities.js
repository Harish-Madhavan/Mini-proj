/**
 * Curated known entity tags for quick attribution (local, no API). Keeps bundle tiny, deterministic.
 * Extend as needed — patterns are prefix/address substring checks, not exhaustive.
 */

// Minimal demonstrator set (real deployments would load from FIU/OFAC feed)
export const KNOWN_ENTITIES = [
  { pattern: 'bc1qxy2k', label: 'Watched address', category: 'watchlist', risk: 'high', note: 'Saved for watching' },
  { pattern: '3E8t', label: 'Exchange Deposit (General)', category: 'exchange', risk: 'low', note: 'Script-address pattern — verify identity via exchange directory' },
  { pattern: 'bc1p', label: 'Taproot Wallet', category: 'taproot', risk: 'info', note: 'BIP341 — may be exchange, multisig, or self-custody' },
  // Wasabi / JoinMarket coordinators leave equal-output fingerprints, not address — handled in CoinJoin detector
  { pattern: '1A1zP', label: 'Genesis (Educational)', category: 'historical', risk: 'low', note: 'Historical/educational — not tainted' },
];

export function tagKnownEntity(address) {
  if (!address || typeof address !== 'string') return null;
  const trimmed = address.trim();
  for (const ent of KNOWN_ENTITIES) {
    if (trimmed.startsWith(ent.pattern) || trimmed.includes(ent.pattern)) return ent;
  }
  // Heuristic exchange tag for custodial-looking addresses (not in curated list but matches deposit script in traceHeuristics)
  if (trimmed.startsWith('3') || trimmed.startsWith('bc1p')) {
    return { label: 'Possible exchange deposit', category: 'exchange-heuristic', risk: 'medium', note: 'Matches exchange address pattern — confirm with a notice' };
  }
  return null;
}

export function getExplorerUrls(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  // Tx hash is 64 hex
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return {
      mempool: `https://mempool.space/tx/${trimmed}`,
      blockstream: `https://blockstream.info/tx/${trimmed}`,
      label: 'View Transaction'
    };
  }
  if (trimmed.startsWith('bc1') || trimmed.startsWith('1') || trimmed.startsWith('3')) {
    return {
      mempool: `https://mempool.space/address/${trimmed}`,
      blockstream: `https://blockstream.info/address/${trimmed}`,
      label: 'View Address'
    };
  }
  if (trimmed.startsWith('tx_')) {
    const hash = trimmed.replace(/^tx_/, '');
    return getExplorerUrls(hash);
  }
  if (trimmed.startsWith('out_') || trimmed.startsWith('in_')) {
    const addr = trimmed.replace(/^(out|in)_/, '');
    return getExplorerUrls(addr);
  }
  return null;
}
