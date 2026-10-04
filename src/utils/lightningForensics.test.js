import { describe, it, expect } from 'vitest';
import { detectLightningAndHtlc, classifyScriptTemplate } from './scriptDecoder';

describe('Lightning Network & Submarine Swap HTLC Forensic Classifier', () => {
  it('detects a 2-of-2 multisig Lightning channel funding script (ASM format)', () => {
    const asm = 'OP_2 02383049b4d8bb81340a6b3d 038289437bb920f3a8b27382 OP_2 OP_CHECKMULTISIG';
    const result = detectLightningAndHtlc(asm);

    expect(result).not.toBeNull();
    expect(result.isLightning).toBe(true);
    expect(result.isSubmarineSwap).toBe(false);
    expect(result.channelType).toBe('2-of-2 Multisig Funding');
    expect(result.layer).toBe('Layer-2 (Lightning Network)');
    expect(result.riskLevel).toBe('HIGH');
  });

  it('detects a 2-of-2 multisig Lightning channel funding script (hex bytecode)', () => {
    // Starts with 52 (OP_2) and ends with 52ae (OP_2 OP_CHECKMULTISIG)
    const hex = '522102383049b4d8bb81340a6b3d92837492837492837492837492837492837492837421038289437bb920f3a8b2738292837492837492837492837492837492837492837452ae';
    const result = detectLightningAndHtlc(hex);

    expect(result).not.toBeNull();
    expect(result.isLightning).toBe(true);
    expect(result.protocol).toBe('Lightning Channel');
  });

  it('detects a Submarine Swap HTLC contract (Boltz / Loop)', () => {
    // Typical Boltz script: OP_HASH160 <hash> OP_EQUAL OP_IF <claim_pubkey> OP_CHECKSIG OP_ELSE <timeout> OP_CHECKLOCKTIMEVERIFY OP_DROP <refund_pubkey> OP_CHECKSIG OP_ENDIF
    const asm = 'OP_HASH160 8472910482910482910482910482910482910482 OP_EQUAL OP_IF 02948294829482 OP_CHECKSIG OP_ELSE 840000 OP_CHECKLOCKTIMEVERIFY OP_DROP 03829482948294 OP_CHECKSIG OP_ENDIF';
    const result = detectLightningAndHtlc(asm);

    expect(result).not.toBeNull();
    expect(result.isLightning).toBe(true);
    expect(result.isSubmarineSwap).toBe(true);
    expect(result.channelType).toBe('Hash Time-Locked Contract (HTLC)');
    expect(result.riskLevel).toBe('CRITICAL');
  });

  it('integrates into classifyScriptTemplate for direct node analysis', () => {
    const asm = 'OP_2 021111111111111111111111 032222222222222222222222 OP_2 OP_CHECKMULTISIG';
    const template = classifyScriptTemplate(asm);

    expect(template.type).toBe('Lightning Channel (2-of-2 multisig)');
    expect(template.lightningInfo).toBeDefined();
    expect(template.lightningInfo.isLightning).toBe(true);
  });

  it('returns null for standard payment scripts like P2PKH or OP_RETURN', () => {
    expect(detectLightningAndHtlc('OP_DUP OP_HASH160 83920182910283910293 OP_EQUALVERIFY OP_CHECKSIG')).toBeNull();
    expect(detectLightningAndHtlc('OP_RETURN 6368616e6765')).toBeNull();
  });
});
