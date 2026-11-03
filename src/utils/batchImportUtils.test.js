import { describe, expect, it } from 'vitest';
import { parseAddressCsv } from './batchImportUtils';

describe('batch address validation', () => {
  it('strips a UTF-8 BOM from a CSV header and validates rows', () => {
    const parsed = parseAddressCsv('\uFEFFaddress,tag\n1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,Genesis');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', tag: 'Genesis', isValid: true });
  });

  it('marks repeated addresses case-insensitively and flags malformed addresses', () => {
    const parsed = parseAddressCsv('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh\nBC1QXY2KGDYGJRSQTZQ2N0YRF2493P83KKFJHX0WLH\nnot-an-address');
    expect(parsed[0].isValid).toBe(true);
    expect(parsed[1].isDuplicate).toBe(true);
    expect(parsed[2].isValid).toBe(false);
  });
});
