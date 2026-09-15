/**
 * AegisTrace Forensic Utilities
 * Supporting Bitcoin address format validation, economic value conversion, and forensic CSV export.
 */

import { downloadBlob } from './download';

// Approximate benchmark exchange rates for law enforcement seizure valuation
export const BTC_USD_BENCHMARK = 95000;
export const USD_INR_BENCHMARK = 86.5;

/**
 * Validate Bitcoin address format (Legacy P2PKH, P2SH, SegWit Bech32, Taproot Bech32m).
 * @param {string} address 
 * @returns {{ isValid: boolean, type: string, error?: string }}
 */
export function validateBtcAddress(address) {
  if (!address || typeof address !== 'string') {
    return { isValid: false, type: 'Unknown', error: 'Address is empty' };
  }

  const trimmed = address.trim();

  // SegWit (Bech32) & Taproot (Bech32m) - validate charset (BIP173 excludes 1 b i o) and length
  if (trimmed.startsWith('bc1')) {
    // Bech32 charset is qp z r y 9 x 8 g f 2 t v d w 0 s 3 j n 5 4 k h c e 6 m u a 7 l (no 1 b i o)
    const bech32Charset = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;
    const lower = trimmed.toLowerCase();
    if (lower !== trimmed && trimmed !== trimmed.toUpperCase()) {
      return { isValid: false, type: 'Address', error: 'Mixed upper/lower case not allowed' };
    }
    if (trimmed.startsWith('bc1p')) {
      if (trimmed.length === 62 && bech32Charset.test(trimmed.slice(4))) {
        return { isValid: true, type: 'Taproot (P2TR)' };
      }
      return { isValid: false, type: 'Taproot', error: 'Invalid Taproot format or length' };
    }
    if (trimmed.startsWith('bc1q')) {
      const dataPart = trimmed.slice(4);
      if ((trimmed.length === 42 || trimmed.length === 62) && bech32Charset.test(dataPart)) {
        return { isValid: true, type: trimmed.length === 62 ? 'SegWit Script (P2WSH)' : 'Native SegWit (P2WPKH)' };
      }
      return { isValid: false, type: 'SegWit', error: 'Invalid SegWit format or length' };
    }
    if (/^bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{25,90}$/.test(lower)) {
      return { isValid: true, type: 'SegWit address' };
    }
    return { isValid: false, type: 'Address', error: 'Invalid characters or length' };
  }

  // Legacy addresses (starts with 1)
  if (trimmed.startsWith('1')) {
    if (trimmed.length >= 26 && trimmed.length <= 35 && /^[1-9A-HJ-NP-za-km-z]+$/.test(trimmed)) {
      return { isValid: true, type: 'Legacy (P2PKH)' };
    }
    return { isValid: false, type: 'Legacy', error: 'Invalid characters or length' };
  }

  // Script addresses (starts with 3)
  if (trimmed.startsWith('3')) {
    if (trimmed.length >= 26 && trimmed.length <= 35 && /^[1-9A-HJ-NP-za-km-z]+$/.test(trimmed)) {
      return { isValid: true, type: 'Pay-to-Script-Hash (P2SH)' };
    }
    return { isValid: false, type: 'Script address', error: 'Invalid characters or length' };
  }

  return { isValid: false, type: 'Invalid', error: 'Unknown address type (starts with bc1, 1, or 3)' };
}

/**
 * Parse a BTC amount out of display strings like "10.50 BTC" (also tolerates
 * numbers and empty values). Single core for every ad-hoc parse in the app.
 */
export function parseBtcAmount(value) {
  if (value == null) return 0;
  const num = parseFloat(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

/**
 * Format satoshis as a bare BTC string (callers add any unit suffix).
 */
export function satsToBtc(sats, decimals = 6) {
  const n = Number(sats) || 0;
  return (n / 100000000).toFixed(decimals);
}

/**
 * Deterministic 64-bit string hash (cyrb53) as 16 uppercase hex chars.
 * Single canonical core shared by cluster IDs and custody digests.
 */
export function cyrb53Hex(str) {
  const s = typeof str === 'string' ? str : JSON.stringify(str);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')).toUpperCase();
}

/**
 * Convert BTC balance string or number to fiat valuations (USD and INR).
 * @param {string|number} btcValue - e.g. "14.85 BTC" or 14.85
 * @returns {{ btc: number, usd: number, inr: number, formattedUsd: string, formattedInr: string }}
 */
export function convertBtcToFiat(btcValue, btcUsdRate = BTC_USD_BENCHMARK, usdInrRate = USD_INR_BENCHMARK) {
  let numericBtc = 0;
  if (typeof btcValue === 'number') {
    numericBtc = btcValue;
  } else if (typeof btcValue === 'string') {
    const parsed = parseFloat(btcValue.replace(/[^0-9.]/g, ''));
    numericBtc = isNaN(parsed) ? 0 : parsed;
  }

  const usd = numericBtc * btcUsdRate;
  const inr = usd * usdInrRate;

  const formattedUsd = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(usd);

  let formattedInr = '';
  if (inr >= 10000000) {
    formattedInr = `₹${(inr / 10000000).toFixed(2)} Cr`;
  } else if (inr >= 100000) {
    formattedInr = `₹${(inr / 100000).toFixed(2)} Lakh`;
  } else {
    formattedInr = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(inr);
  }

  return {
    btc: numericBtc,
    usd,
    inr,
    formattedUsd,
    formattedInr
  };
}

/**
 * Generate and trigger download of a forensic CSV evidence file.
 * @param {string} filename 
 * @param {Array<Object>} rows 
 * @param {Array<{ key: string, header: string }>} columns 
 */
function sanitizeCsvValue(value) {
  let str = String(value);
  // Prevent CSV formula injection: prefix with single quote if starts with = + - @ tab or carriage return
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export function exportToCsv(filename, rows, columns) {
  if (!rows || !rows.length) return false;

  const headerLine = columns.map(c => sanitizeCsvValue(c.header)).join(',');
  const rowLines = rows.map(row => {
    return columns.map(c => {
      const val = row[c.key] !== undefined && row[c.key] !== null ? String(row[c.key]) : '';
      return sanitizeCsvValue(val);
    }).join(',');
  });

  const csvContent = [headerLine, ...rowLines].join('\r\n');
  downloadBlob(csvContent, filename.endsWith('.csv') ? filename : `${filename}.csv`, 'text/csv;charset=utf-8;');
  return true;
}
