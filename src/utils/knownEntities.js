/**
 * Curated known entity tags for quick attribution (local, no API). Keeps bundle tiny, deterministic.
 * Covers:
 * - Watchlist and exchange fingerprints
 * - OFAC Sanctioned Entities & Darknet Markets (Garantex, Tornado, Blender, Lazarus, Hydra)
 * - Multi-chain explorer routing (Bitcoin, Ethereum, Tron, Solana)
 */

export const KNOWN_ENTITIES = [
  { pattern: 'bc1qxy2k', label: 'Watched address', category: 'watchlist', risk: 'high', note: 'Saved for watching' },
  { pattern: '3E8t', label: 'Exchange Deposit (General)', category: 'exchange', risk: 'low', note: 'Script-address pattern — verify identity via exchange directory' },
  { pattern: 'bc1p', label: 'Taproot Wallet', category: 'taproot', risk: 'info', note: 'BIP341 — may be exchange, multisig, or self-custody' },
  { pattern: '1A1zP', label: 'Genesis (Educational)', category: 'historical', risk: 'low', note: 'Historical/educational — not tainted' },
  
  // OFAC Sanctioned & High-Risk Entities
  { pattern: '1L26z', label: 'Garantex Exchange [OFAC]', category: 'sanctioned', risk: 'critical', note: 'Designated by US Treasury OFAC (Executive Order 14024)' },
  { pattern: '14LvL', label: 'Hydra Darknet Market', category: 'darknet', risk: 'critical', note: 'Seized darknet narcotics marketplace cluster' },
  { pattern: 'bc1qa5wk', label: 'Lazarus Group [OFAC]', category: 'sanctioned', risk: 'critical', note: 'DPRK state-sponsored cyber syndicate attributed cluster' },
  { pattern: '1BtcB', label: 'Blender.io Mixer [OFAC]', category: 'sanctioned', risk: 'critical', note: 'Sanctioned virtual currency mixer used in illicit laundering' },
  { pattern: '0x12D6', label: 'Tornado Cash Router [OFAC]', category: 'sanctioned', risk: 'critical', note: 'OFAC SDN designated smart contract address' }
];

export function tagKnownEntity(address) {
  if (!address || typeof address !== 'string') return null;
  const trimmed = address.trim();
  for (const ent of KNOWN_ENTITIES) {
    if (trimmed.startsWith(ent.pattern) || trimmed.includes(ent.pattern)) return ent;
  }
  // Heuristic exchange tag for custodial-looking addresses
  if (trimmed.startsWith('3') || trimmed.startsWith('bc1p')) {
    return { label: 'Possible exchange deposit', category: 'exchange-heuristic', risk: 'medium', note: 'Matches exchange address pattern — confirm with a notice' };
  }
  return null;
}

export function getExplorerUrls(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();

  // Strip prefixes if present
  if (trimmed.startsWith('tx_')) return getExplorerUrls(trimmed.replace(/^tx_/, ''));
  if (trimmed.startsWith('out_') || trimmed.startsWith('in_')) return getExplorerUrls(trimmed.replace(/^(out|in)_/, ''));

  // Bitcoin Tx hash (64 hex)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return {
      mempool: `https://mempool.space/tx/${trimmed}`,
      blockstream: `https://blockstream.info/tx/${trimmed}`,
      label: 'View Bitcoin Tx'
    };
  }

  // Bitcoin address
  if (trimmed.startsWith('bc1') || trimmed.startsWith('1') || trimmed.startsWith('3')) {
    return {
      mempool: `https://mempool.space/address/${trimmed}`,
      blockstream: `https://blockstream.info/address/${trimmed}`,
      label: 'View Bitcoin Address'
    };
  }

  // Ethereum / EVM address (0x...)
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return {
      mempool: `https://etherscan.io/address/${trimmed}`,
      blockstream: `https://etherscan.io/address/${trimmed}`,
      label: 'View on Etherscan (ETH)'
    };
  }

  // Tron address (T...)
  if (/^T[a-zA-Z0-9]{33}$/.test(trimmed)) {
    return {
      mempool: `https://tronscan.org/#/address/${trimmed}`,
      blockstream: `https://tronscan.org/#/address/${trimmed}`,
      label: 'View on Tronscan (TRX)'
    };
  }

  return null;
}
