import { describe, it, expect } from 'vitest';
import { tagKnownEntity, getExplorerUrls } from './knownEntities';

describe('knownEntities', () => {
  it('does not treat short prefixes as verified entity identities', () => {
    expect(tagKnownEntity('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBeNull();
    expect(tagKnownEntity('3E8tMa9Jkdf923kd8mzklaq02947aWazirX')?.category).toBe('exchange-heuristic');
  });

  it('does not infer sanctions attribution from short address fragments', () => {
    const garantex = tagKnownEntity('1L26zGarantexDepositWalletAddress');
    expect(garantex).toBeNull();
    expect(tagKnownEntity('0x12D6' + 'a'.repeat(36))).not.toMatchObject({ category: 'sanctioned' });
  });

  it('does not apply unverified exact-identifier attributions', () => {
    expect(tagKnownEntity('34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo')?.category).toBe('exchange-heuristic');
    expect(tagKnownEntity('bc1qa2dn50l6k0m2m3wdf3c08z6gq2fsmrwhj5v6d7')).toBeNull();
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

    const solUrl = getExplorerUrls('5U3bKWKubDU4i4GzY3fP4Z1w27iY7F2yJ5M2D5G8x7kZ');
    expect(solUrl).not.toBeNull();
    expect(solUrl.mempool).toContain('solscan.io');
    expect(solUrl.label).toContain('SOL');
  });
});
