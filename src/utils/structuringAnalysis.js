/**
 * AegisTrace Structuring / Smurfing Detector (NCB Narcotics-Typology Module)
 *
 * Narcotics proceeds are routinely "smurfed": split into batches of similar
 * sub-threshold payments (hawala-style layering) so no single transfer looks
 * anomalous. On-chain there is no statutory reporting threshold, so the value
 * cap below is a configurable investigative parameter, not a legal limit.
 *
 * Detection: sibling outputs (same funding source) are grouped into value
 * bands within BAND_TOLERANCE of each other. A band of >= MIN_BAND_SIZE
 * outputs, each under VALUE_CAP_SATS, is a structuring signal. Genuine
 * CoinJoin rounds are excluded (equal-denomination mixing is scored by the
 * CoinJoin detectors instead) so the two typologies don't double-count.
 */

import { parseBtcAmount } from './forensicUtils';
import { BITCOIN_CONSTANTS } from '../constants/config';

export const STRUCTURING_CONFIG = {
  /** Band tolerance: outputs within ±5% group together. */
  BAND_TOLERANCE: 0.05,
  /** Minimum outputs in a band to flag. */
  MIN_BAND_SIZE: 3,
  /** Investigative cap per structured payment (0.5 BTC). Configurable, not statutory. */
  VALUE_CAP_SATS: 50000000,
  /** Dust is uneconomic noise, never structuring (shared bitcoin dust floor). */
  DUST_FLOOR_SATS: BITCOIN_CONSTANTS.DUST_THRESHOLD_SATS,
  /**
   * Minimum share of sibling outflow a band must represent (0.5%). Without
   * this, any large batch dispersal with a few similar-valued dust fragments
   * flags as smurfing — e.g. a 241 BTC batch whose ~$140 fragments banded at
   * 0.003% of outflow. Genuine structuring moves meaningful sums.
   */
  MIN_BAND_SHARE: 0.005,
};

/**
 * Group satoshi values into proximity bands.
 * @returns {Array<{ representative: number, members: number[] }>}
 */
export function bandByValueProximity(values = [], tolerance = STRUCTURING_CONFIG.BAND_TOLERANCE) {
  const sorted = [...values].sort((a, b) => a - b);
  const bands = [];
  for (const v of sorted) {
    const band = bands.find(b => Math.abs(v - b.representative) / b.representative <= tolerance);
    if (band) {
      band.members.push(v);
      band.representative = band.members.reduce((s, x) => s + x, 0) / band.members.length;
    } else {
      bands.push({ representative: v, members: [v] });
    }
  }
  return bands;
}

/**
 * Inspect one set of sibling outputs (raw tx vouts or graph edge values).
 * @param {number[]} outputSats - sibling output values in satoshis
 * @param {boolean} multiPartyInputs - true when 3+ distinct inputs fund the tx.
 *   Identical-value bands from multi-party inputs are CoinJoin mixing (scored
 *   by the CoinJoin detectors) and are excluded here so the two typologies
 *   never double-count. Identical outputs from a single wallet splitting its
 *   own funds stay in scope — that is textbook smurfing.
 */
export function detectStructuring(outputSats = [], multiPartyInputs = false) {
  const candidates = (outputSats || []).filter(v => Number.isFinite(v) && v >= STRUCTURING_CONFIG.DUST_FLOOR_SATS);
  if (candidates.length < STRUCTURING_CONFIG.MIN_BAND_SIZE) {
    return { isStructuring: false, bandCount: 0, maxBandSize: 0, bands: [], confidence: 0 };
  }

  const candidateTotal = candidates.reduce((s, v) => s + v, 0) || 1;
  const bands = bandByValueProximity(candidates)
    .filter(b => b.members.length >= STRUCTURING_CONFIG.MIN_BAND_SIZE)
    .filter(b => {
      if (!b.members.every(v => v <= STRUCTURING_CONFIG.VALUE_CAP_SATS)) return false;
      if (multiPartyInputs && new Set(b.members).size === 1) return false; // CoinJoin lane
      const bandTotal = b.members.reduce((s, v) => s + v, 0);
      if (bandTotal / candidateTotal < STRUCTURING_CONFIG.MIN_BAND_SHARE) return false; // fragment noise
      return true;
    })
    .map(b => ({
      count: b.members.length,
      valueSats: Math.round(b.representative),
      valueBtc: (b.representative / 1e8).toFixed(4),
      totalSats: b.members.reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => b.count - a.count);

  if (bands.length === 0) {
    return { isStructuring: false, bandCount: 0, maxBandSize: 0, bands: [], confidence: 0 };
  }

  const maxBandSize = bands[0].count;
  // Confidence grows with band size and with sub-cap discipline (all members
  // well under the cap looks deliberate, not coincidental).
  const sizeComponent = Math.min(55, (maxBandSize - STRUCTURING_CONFIG.MIN_BAND_SIZE + 1) * 18);
  const disciplineComponent = bands[0].valueSats < STRUCTURING_CONFIG.VALUE_CAP_SATS / 2 ? 15 : 5;
  const multiBandBonus = bands.length > 1 ? 10 : 0;
  const confidence = Math.min(95, 25 + sizeComponent + disciplineComponent + multiBandBonus);

  return {
    isStructuring: true,
    bandCount: bands.length,
    maxBandSize,
    bands,
    confidence,
  };
}

/**
 * Inspect a raw Bitcoin transaction's outputs for structuring.
 */
export function detectStructuringTx(tx) {
  if (!tx || !Array.isArray(tx.vout)) {
    return { isStructuring: false, bandCount: 0, maxBandSize: 0, bands: [], confidence: 0 };
  }
  const sats = tx.vout.map(o => o.value).filter(v => typeof v === 'number');
  const multiPartyInputs = (tx.vin || []).length >= 3;
  return detectStructuring(sats, multiPartyInputs);
}

/**
 * Scan a case graph: per funding source, group outbound edge values.
 * @returns {{ detected: boolean, sources: Array, maxBandSize: number, confidence: number }}
 */
export function scanCaseStructuring(nodes = [], links = []) {
  if (!nodes?.length || !links?.length) {
    return { detected: false, sources: [], maxBandSize: 0, confidence: 0 };
  }

  const parseBtc = (v) => parseBtcAmount(v);
  const bySource = new Map();
  links.forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : l.source;
    const sats = Math.round(parseBtc(l.value) * 1e8);
    if (sats <= 0) return; // data carriers move no funds
    if (!bySource.has(src)) bySource.set(src, []);
    bySource.get(src).push(sats);
  });

  const sources = [];
  for (const [sourceId, sats] of bySource) {
    const result = detectStructuring(sats, false);
    if (result.isStructuring) {
      sources.push({ sourceId, ...result });
    }
  }

  if (sources.length === 0) {
    return { detected: false, sources: [], maxBandSize: 0, confidence: 0 };
  }

  sources.sort((a, b) => b.maxBandSize - a.maxBandSize);
  return {
    detected: true,
    sources,
    maxBandSize: sources[0].maxBandSize,
    confidence: Math.min(95, Math.max(...sources.map(s => s.confidence))),
  };
}
