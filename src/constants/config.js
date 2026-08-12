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
