import { describe, it, expect } from 'vitest';
import { tagKnownEntity, getExplorerUrls } from './knownEntities';

describe('knownEntities', () => {
  it('tags known patterns', () => {
    expect(tagKnownEntity('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBeTruthy();
    expect(tagKnownEntity('3E8tMa9Jkdf923kd8mzklaq02947aWazirX')?.category).toBe('exchange');
  });
  it('returns explorer urls for tx and address', () => {
    const txUrl = getExplorerUrls('4b9a8f2e71d3c05c8a9f0e1d2c3b4a5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b');
    expect(txUrl.mempool).toContain('mempool.space/tx');
    const addrUrl = getExplorerUrls('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
    expect(addrUrl.blockstream).toContain('/address/');
  });
});
