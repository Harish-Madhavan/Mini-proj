import { validateBtcAddress } from './forensicUtils';

/**
 * Parses raw text or CSV content into validated address objects.
 *
 * @param {string} rawText - Multi-line CSV or text block
 * @returns {Array<Object>} Parsed and validated address records
 */
export function parseAddressCsv(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip common header row
    if (i === 0 && (line.toLowerCase().startsWith('address') || line.toLowerCase().startsWith('btc'))) continue;

    // Split by comma or tab or semicolon
    const parts = line.split(/[,;\t]+/).map(p => p.trim().replace(/^["']|["']$/g, ''));
    const addr = parts[0];
    if (!addr) continue;

    const lower = addr.toLowerCase();
    const isDupe = seen.has(lower);
    seen.add(lower);

    const validation = validateBtcAddress(addr);
    const tag = parts[1] || 'Seized Address';
    const notes = parts[2] || 'Batch imported';
    const riskTier = (parts[3] || 'HIGH').toUpperCase();

    results.push({
      index: i + 1,
      address: addr,
      tag,
      notes,
      riskTier: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(riskTier) ? riskTier : 'HIGH',
      isValid: validation.isValid,
      error: validation.error || null,
      isDuplicate: isDupe
    });
  }

  return results;
}
