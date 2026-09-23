import { describe, it, expect } from 'vitest';
import { tagKnownEntity, getExplorerUrls } from './knownEntities';

describe('knownEntities', () => {
  it('tags known patterns', () => {
    expect(tagKnownEntity('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBeTruthy();
    expect(tagKnownEntity('3E8tMa9Jkdf923kd8mzklaq02947aWazirX')?.category).toBe('exchange');
  });

  it('tags OFAC sanctioned and darknet marketplace entities', () => {
    const garantex = tagKnownEntity('1L26zGarantexDepositWalletAddress');
    expect(garantex).not.toBeNull();
    expect(garantex.category).toBe('sanctioned');
    expect(garantex.risk).toBe('critical');

    const lazarus = tagKnownEntity('bc1qa5wkDPRKAttributedCluster');
    expect(lazarus).not.toBeNull();
    expect(lazarus.label).toContain('Lazarus');
  });

  it('returns explorer urls for tx and bitcoin address', () => {
    const txUrl = getExplorerUrls('4b9a8f2e71d3c05c8a9f0e1d2c3b4a5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b');
    expect(txUrl.mempool).toContain('mempool.space/tx');
    const addrUrl = getExplorerUrls('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
    expect(addrUrl.blockstream).toContain('/address/');
  });

  it('returns multi-chain explorer urls for Ethereum and Tron addresses', () => {
    const ethUrl = getExplorerUrls('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    expect(ethUrl).not.toBeNull();
    expect(ethUrl.mempool).toContain('etherscan.io');

    const trxUrl = getExplorerUrls('TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7');
    expect(trxUrl).not.toBeNull();
    expect(trxUrl.mempool).toContain('tronscan.org');
  });
});
