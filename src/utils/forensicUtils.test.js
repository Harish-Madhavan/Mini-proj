import { describe, it, expect } from 'vitest';
import { validateBtcAddress, convertBtcToFiat } from './forensicUtils';

describe('forensicUtils', () => {
  describe('validateBtcAddress', () => {
    it('validates Native SegWit Bech32 address', () => {
      const res = validateBtcAddress('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
      expect(res.isValid).toBe(true);
      expect(res.type).toContain('Native SegWit');
    });

    it('validates Taproot Bech32m address', () => {
      const res = validateBtcAddress('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0');
      expect(res.isValid).toBe(true);
      expect(res.type).toContain('Taproot');
    });

    it('validates Legacy P2PKH address', () => {
      const res = validateBtcAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      expect(res.isValid).toBe(true);
      expect(res.type).toContain('Legacy');
    });

    it('validates P2SH address', () => {
      const res = validateBtcAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy');
      expect(res.isValid).toBe(true);
      expect(res.type).toContain('Pay-to-Script-Hash');
    });

    it('rejects invalid address formats', () => {
      const res1 = validateBtcAddress('invalid_random_string');
      expect(res1.isValid).toBe(false);

      const res2 = validateBtcAddress('');
      expect(res2.isValid).toBe(false);

      const res3 = validateBtcAddress(null);
      expect(res3.isValid).toBe(false);
    });
  });

  describe('convertBtcToFiat', () => {
    it('computes USD and INR amounts from number', () => {
      const result = convertBtcToFiat(10, 100000, 85);
      expect(result.btc).toBe(10);
      expect(result.usd).toBe(1000000);
      expect(result.inr).toBe(85000000);
      expect(result.formattedInr).toBe('₹8.50 Cr');
    });

    it('parses formatted BTC string correctly', () => {
      const result = convertBtcToFiat('14.85 BTC', 100000, 80);
      expect(result.btc).toBe(14.85);
      expect(result.usd).toBe(1485000);
    });
  });
});
