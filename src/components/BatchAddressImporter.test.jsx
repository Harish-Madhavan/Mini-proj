import { describe, it, expect } from 'vitest';
import { parseAddressCsv } from '../utils/batchImportUtils';

describe('BatchAddressImporter CSV and text parsing', () => {
  it('parses single-column raw Bitcoin addresses', () => {
    const raw = `
      bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
      1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
      3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy
    `;

    const parsed = parseAddressCsv(raw);
    expect(parsed.length).toBe(3);
    expect(parsed.every(p => p.isValid)).toBe(true);
    expect(parsed[0].address).toBe('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
  });

  it('parses CSV with headers, tags, notes, and risk tiers', () => {
    const csv = `
address,tag,notes,riskTier
bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh,Suspect Alpha,Seized phone,CRITICAL
1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,Satoshi Target,Hardcoded,HIGH
    `;

    const parsed = parseAddressCsv(csv);
    expect(parsed.length).toBe(2);
    expect(parsed[0].tag).toBe('Suspect Alpha');
    expect(parsed[0].notes).toBe('Seized phone');
    expect(parsed[0].riskTier).toBe('CRITICAL');
  });

  it('flags invalid addresses and detects duplicates', () => {
    const text = `
      bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
      not_a_valid_bitcoin_address
      bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
    `;

    const parsed = parseAddressCsv(text);
    expect(parsed.length).toBe(3);
    expect(parsed[0].isValid).toBe(true);
    expect(parsed[0].isDuplicate).toBe(false);

    expect(parsed[1].isValid).toBe(false);

    expect(parsed[2].isValid).toBe(true);
    expect(parsed[2].isDuplicate).toBe(true);
  });
});
