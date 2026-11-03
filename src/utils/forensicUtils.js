/**
 * AegisTrace Forensic Utilities
 * Supporting Bitcoin address format validation, economic value conversion, and forensic CSV export.
 */

import { downloadBlob } from './download';

// Approximate benchmark exchange rates for law enforcement seizure valuation
export const BTC_USD_BENCHMARK = 95000;
export const USD_INR_BENCHMARK = 86.5;

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values) {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < generators.length; i++) {
      if ((top >>> i) & 1) checksum ^= generators[i];
    }
  }
  return checksum >>> 0;
}

function convertWitnessProgram(data) {
  let accumulator = 0;
  let bits = 0;
  const bytes = [];
  for (const value of data) {
    accumulator = (accumulator << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >>> bits) & 0xff);
    }
  }
  if (bits >= 5 || ((accumulator << (8 - bits)) & 0xff) !== 0) return null;
  return bytes;
}

function validateSegwitAddress(address) {
  if (address.length > 90) return { isValid: false, type: 'SegWit', error: 'Address exceeds the Bech32 length limit' };
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) {
    return { isValid: false, type: 'Address', error: 'Mixed upper/lower case not allowed' };
  }
  const normalized = address.toLowerCase();
  const separator = normalized.lastIndexOf('1');
  if (separator < 1 || normalized.slice(0, separator) !== 'bc' || normalized.length - separator < 7) {
    return { isValid: false, type: 'SegWit', error: 'Invalid Bitcoin mainnet Bech32 structure' };
  }
  const encoded = normalized.slice(separator + 1);
  const values = [];
  for (const char of encoded) {
    const value = BECH32_CHARSET.indexOf(char);
    if (value < 0) return { isValid: false, type: 'SegWit', error: 'Invalid Bech32 character' };
    values.push(value);
  }
  const hrpExpand = [98 >> 5, 99 >> 5, 0, 98 & 31, 99 & 31];
  const checksum = bech32Polymod([...hrpExpand, ...values]);
  const witnessVersion = values[0];
  if (witnessVersion > 16) return { isValid: false, type: 'SegWit', error: 'Invalid witness version' };
  const program = convertWitnessProgram(values.slice(1, -6));
  if (!program || program.length < 2 || program.length > 40) {
    return { isValid: false, type: 'SegWit', error: 'Invalid witness program length or padding' };
  }
  if (witnessVersion === 0 && checksum !== 1) return { isValid: false, type: 'SegWit', error: 'Invalid Bech32 checksum for witness version 0' };
  if (witnessVersion !== 0 && checksum !== 0x2bc830a3) return { isValid: false, type: 'SegWit', error: 'Invalid Bech32m checksum' };
  if (witnessVersion === 0 && ![20, 32].includes(program.length)) {
    return { isValid: false, type: 'SegWit', error: 'Version 0 witness programs must be 20 or 32 bytes' };
  }
  if (witnessVersion === 1 && program.length !== 32) {
    return { isValid: false, type: 'Taproot', error: 'Taproot witness programs must be 32 bytes' };
  }
  if (witnessVersion === 1) return { isValid: true, type: 'Taproot (P2TR)' };
  if (witnessVersion === 0 && program.length === 32) return { isValid: true, type: 'SegWit Script (P2WSH)' };
  if (witnessVersion === 0) return { isValid: true, type: 'Native SegWit (P2WPKH)' };
  return { isValid: true, type: `SegWit v${witnessVersion}` };
}

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
  if (!trimmed) return { isValid: false, type: 'Unknown', error: 'Address is empty' };

  if (/^bc1/i.test(trimmed)) return validateSegwitAddress(trimmed);

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
