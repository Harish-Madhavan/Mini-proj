export const API_CONFIG = {
  PRIMARY_BASE_URL: 'https://blockstream.info/api',
  FALLBACK_BASE_URL: 'https://mempool.space/api',
  CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  MAX_CACHE_SIZE: 100 // LRU bound
};

export const APP_METADATA = {
  TITLE: 'AEGISTRACE',
  SUBTITLE: 'NCB Blockchain Forensics Terminal',
  SYSTEM_VERSION: 'AegisTrace · SIH1675'
};

export const TRACE_CONFIG = {
  MAX_BRANCHING: 8,
  MAX_NODES: 120,
  COINJOIN_HALT: true,
  COINJOIN_ANONYMITY_THRESHOLD: 0.85,
  CONFIDENCE_LOW_THRESHOLD: 0.35,
  // High-confidence change branches may run this many levels past maxDepth:
  // peel chains are near-deterministic trails, fan-outs are not.
  EXTRA_PEEL_DEPTH: 2
};

export const BITCOIN_CONSTANTS = {
  DUST_THRESHOLD_SATS: 546,
  SATS_PER_BTC: 100000000,
  // Fee tiers in sat/vB (approx mempool quartiles, mainnet avg 8-12 sat/vB as of 2025-2026)
  FEE_TIER_LOW: 3,
  FEE_TIER_AVG: 15,
  FEE_TIER_HIGH: 80,
};

// Consolidation-sweep detector tuning (single shared source — no inline
// magic numbers in obfuscationForensics.js).
export const SWEEP_CONFIG = {
  // Minimum value-bearing inputs before fan-in counts as a sweep.
  MIN_INPUTS: 4,
  // Dominant output must carry ~all input value (minus fee).
  DOMINANT_INPUT_SHARE: 0.8,
  // ...and dwarf the side branch (true consolidations, not even splits).
  DOMINANT_OUTPUT_RATIO: 4,
  // Confidence: base + per-extra-input, custodial bonus, 2-out ambiguity haircut.
  BASE_CONFIDENCE: 55,
  INPUT_CONFIDENCE_STEP: 6,
  MAX_INPUT_BONUS: 25,
  CUSTODIAL_BONUS: 15,
  DOMINANT_TWO_OUT_HAIRCUT: 5,
  MAX_CONFIDENCE: 95,
  MIN_CONFIDENCE: 55,
};

// Address-trace history picker tuning (single shared source — no inline
// magic numbers in bitcoinApi.js).
export const ADDRESS_TRACE_CONFIG = {
  // Walk at most 8 pages (200 txs) back through dust before giving up.
  MAX_PAGES: 8,
  // A movement worth tracing on its own: 0.5 BTC involving the address.
  SIGNIFICANT_SATS: 50000000,
};

// Fixed (non-tunable) risk signal scores. These mirror the obfuscation
// dossier's confidence tiers so the risk aggregate and the dossier never
// disagree about whether a sweep/sanction hit matters.
export const RISK_SIGNAL_SCORES = {
  CONSOLIDATION_IMMINENT: 15,
  CONSOLIDATION_WATCH: 8,
  SANCTIONED_ENTITY: 15,
  DARKNET_ENTITY: 10,
};
