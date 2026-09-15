import { describe, it, expect } from 'vitest';
import { decodeScriptPubkey, disassembleScriptHex } from './scriptDecoder';

describe('scriptDecoder', () => {
  it('decodes Native SegWit P2WPKH and P2WSH addresses', () => {
    const p2wpkh = decodeScriptPubkey('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
    expect(p2wpkh.type).toContain('P2WPKH');
    expect(p2wpkh.witnessVersion).toBe(0);
    expect(p2wpkh.asm).toContain('OP_0');

    const p2wsh = decodeScriptPubkey('bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3');
    expect(p2wsh.type).toContain('P2WSH');
    expect(p2wsh.programLength).toContain('32 bytes');
  });

  it('decodes Taproot P2TR addresses', () => {
    const p2tr = decodeScriptPubkey('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0');
    expect(p2tr.type).toContain('P2TR');
    expect(p2tr.witnessVersion).toBe(1);
    expect(p2tr.asm).toContain('OP_1');
  });

  it('decodes Legacy P2PKH addresses', () => {
    const p2pkh = decodeScriptPubkey('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    expect(p2pkh.type).toContain('P2PKH');
    expect(p2pkh.asm).toContain('OP_DUP OP_HASH160');
    expect(p2pkh.asm).toContain('OP_CHECKSIG');
  });

  it('decodes P2SH multi-sig addresses', () => {
    const p2sh = decodeScriptPubkey('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy');
    expect(p2sh.type).toContain('P2SH');
    expect(p2sh.asm).toContain('OP_HASH160');
  });

  it('decodes OP_RETURN null data scripts', () => {
    const op = decodeScriptPubkey('6a48656c6c6f20426974636f696e');
    expect(op.type).toContain('OP_RETURN');
    expect(op.securityRating).toContain('Provably unspendable');
  });

  it('decodes raw P2PK pubkey curve points', () => {
    const p2pk = decodeScriptPubkey('0411db93e1dcdb8a016b49840f8c53bc1eb68a382e97b1482ecad7b148a6909a5cb2e0eaddfb84ccf9744464f82e160bfa9b8b64f9d4c03f999b8643f656b412a3ac');
    expect(p2pk.type).toContain('P2PK');
    expect(p2pk.asm).toContain('OP_CHECKSIG');
  });

  it('disassembles standard Bitcoin script bytecode with CLTV/CSV opcodes', () => {
    // 76a914(20 bytes)88ac = OP_DUP OP_HASH160 PUSHBYTES_20 ... OP_EQUALVERIFY OP_CHECKSIG
    const p2pkhBytecode = '76a91489abcdefabbaabbaabbaabbaabbaabbaabbaabba88ac';
    const tokens = disassembleScriptHex(p2pkhBytecode);

    expect(tokens.length).toBe(5);
    expect(tokens[0].opcode).toBe('OP_DUP');
    expect(tokens[1].opcode).toBe('OP_HASH160');
    expect(tokens[2].opcode).toBe('PUSHBYTES_20');
    expect(tokens[3].opcode).toBe('OP_EQUALVERIFY');
    expect(tokens[4].opcode).toBe('OP_CHECKSIG');
  });
});
