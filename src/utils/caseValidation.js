import { validateBtcAddress } from './forensicUtils';

const MAX_CASE_NODES = 5000;
const MAX_CASE_LINKS = 20000;
const MAX_ID_LENGTH = 256;
const BTC_SUPPLY_SATS = 2_100_000_000_000_000;

function isValidAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value <= 21_000_000;
  if (typeof value !== 'string' || value.length > 128) return false;
  const amount = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*(BTC|sats?|sat)?\b/i);
  if (!amount) return true;
  const number = Number(amount[1]);
  if (!Number.isFinite(number) || number < 0) return false;
  const unit = (amount[2] || 'btc').toLowerCase();
  return unit.startsWith('sat') ? number <= BTC_SUPPLY_SATS : number <= 21_000_000;
}

/** Validate imported graph references and bounded scalar values. */
export function isValidCaseShape(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) ||
      typeof obj.id !== 'string' || !obj.id.trim() || obj.id.length > MAX_ID_LENGTH ||
      !Array.isArray(obj.nodes) || !Array.isArray(obj.links) ||
      obj.nodes.length === 0 || obj.nodes.length > MAX_CASE_NODES ||
      obj.links.length > MAX_CASE_LINKS ||
      (obj.schemaVersion != null && obj.schemaVersion !== 1)) return false;
  if (obj.title != null && (typeof obj.title !== 'string' || obj.title.length > 500)) return false;
  if (obj.description != null && (typeof obj.description !== 'string' || obj.description.length > 20000)) return false;
  if (obj.riskScore != null && (!Number.isFinite(obj.riskScore) || obj.riskScore < 0 || obj.riskScore > 100)) return false;
  if (obj.initialTxHash != null && (typeof obj.initialTxHash !== 'string' || obj.initialTxHash.length > 128)) return false;
  if (obj.status === 'LIVE_TRACE' && !/^[0-9a-f]{64}$/i.test(obj.initialTxHash || '')) return false;

  const nodeIds = new Set();
  for (const node of obj.nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node) ||
        typeof node.id !== 'string' || !node.id.trim() || node.id.length > MAX_ID_LENGTH ||
        nodeIds.has(node.id) || (node.balance != null && !isValidAmount(node.balance))) return false;
    const address = node.details?.address;
    if (obj.status === 'LIVE_TRACE' && typeof address === 'string' && /^(bc1|1|3)/i.test(address) &&
        !validateBtcAddress(address).isValid) return false;
    nodeIds.add(node.id);
  }
  return obj.links.every(link => {
    if (!link || typeof link !== 'object') return false;
    const source = typeof link.source === 'object' ? link.source?.id : link.source;
    const target = typeof link.target === 'object' ? link.target?.id : link.target;
    return typeof source === 'string' && typeof target === 'string' &&
      source.length <= MAX_ID_LENGTH && target.length <= MAX_ID_LENGTH &&
      nodeIds.has(source) && nodeIds.has(target) &&
      (link.value == null || isValidAmount(link.value)) &&
      (link.timestamp == null || (typeof link.timestamp === 'string' && link.timestamp.length <= 256)) &&
      (link.txid == null || (typeof link.txid === 'string' && /^[0-9a-f]{64}$/i.test(link.txid)));
  });
}
