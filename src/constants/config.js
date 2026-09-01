export const API_CONFIG = {
  PRIMARY_BASE_URL: 'https://blockstream.info/api',
  FALLBACK_BASE_URL: 'https://mempool.space/api',
  CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  MAX_CACHE_SIZE: 100 // LRU bound
};

export const APP_METADATA = {
  TITLE: 'AEGISTRACE',
  SUBTITLE: 'NCB Blockchain Forensics Terminal',
  SYSTEM_VERSION: 'AegisTrace NCB System V2.8.4 - SIH1675 Live Blockchain Explorer'
};

export const TRACE_CONFIG = {
  MAX_BRANCHING: 8,
  MAX_NODES: 120,
  COINJOIN_HALT: true,
  COINJOIN_ANONYMITY_THRESHOLD: 0.85,
  CONFIDENCE_LOW_THRESHOLD: 0.35
};

export const BITCOIN_CONSTANTS = {
  DUST_THRESHOLD_SATS: 546,
  // Fee tiers in sat/vB (approx mempool quartiles, mainnet avg 8-12 sat/vB as of 2025-2026)
  FEE_TIER_LOW: 3,
  FEE_TIER_AVG: 15,
  FEE_TIER_HIGH: 80,
};
