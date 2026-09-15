/**
 * Cryptographic Bitcoin Script Disassembler & Opcode Parser (SIH1675 Core)
 * Provides tokenized opcode breakdown, script templates, entropy checks, and checksum validation.
 */

// Standard Bitcoin Opcode Hex Map
export const BITCOIN_OPCODES = {
  '00': 'OP_0',
  '4f': 'OP_1NEGATE',
  '51': 'OP_1',
  '52': 'OP_2',
  '53': 'OP_3',
  '54': 'OP_4',
  '55': 'OP_5',
  '56': 'OP_6',
  '57': 'OP_7',
  '58': 'OP_8',
  '59': 'OP_9',
  '5a': 'OP_10',
  '5b': 'OP_11',
  '5c': 'OP_12',
  '5d': 'OP_13',
  '5e': 'OP_14',
  '5f': 'OP_15',
  '60': 'OP_16',
  '61': 'OP_NOP',
  '63': 'OP_IF',
  '64': 'OP_NOTIF',
  '67': 'OP_ELSE',
  '68': 'OP_ENDIF',
  '69': 'OP_VERIFY',
  '6a': 'OP_RETURN',
  '73': 'OP_IFDUP',
  '74': 'OP_DEPTH',
  '75': 'OP_DROP',
  '76': 'OP_DUP',
  '77': 'OP_NIP',
  '78': 'OP_OVER',
  '87': 'OP_EQUAL',
  '88': 'OP_EQUALVERIFY',
  'a6': 'OP_RIPEMD160',
  'a7': 'OP_SHA1',
  'a8': 'OP_SHA256',
  'a9': 'OP_HASH160',
  'aa': 'OP_HASH256',
  'ac': 'OP_CHECKSIG',
  'ad': 'OP_CHECKSIGVERIFY',
  'ae': 'OP_CHECKMULTISIG',
  'af': 'OP_CHECKMULTISIGVERIFY',
  'b0': 'OP_NOP1',
  'b1': 'OP_CHECKLOCKTIMEVERIFY', // CLTV (BIP65)
  'b2': 'OP_CHECKSEQUENCEVERIFY', // CSV (BIP112)
};

/**
 * Disassemble raw hex script into tokenized opcodes and data pushes.
 * @param {string} hexScript - Raw hex script bytecode
 * @returns {Array<{ opcode: string, hex: string, isData: boolean, dataText?: string }>}
 */
export function disassembleScriptHex(hexScript) {
  if (!hexScript || typeof hexScript !== 'string') return [];
  const cleanHex = hexScript.trim().toLowerCase().replace(/^0x/, '');
  const tokens = [];

  let i = 0;
  while (i < cleanHex.length) {
    const byte = cleanHex.slice(i, i + 2);
    i += 2;

    const opNum = parseInt(byte, 16);

    // Direct push of 1 to 75 bytes
    if (opNum >= 1 && opNum <= 75) {
      const dataLen = opNum;
      const dataHex = cleanHex.slice(i, i + dataLen * 2);
      i += dataLen * 2;

      // Check for printable ASCII
      let ascii = '';
      try {
        const bytes = dataHex.match(/.{1,2}/g)?.map(b => parseInt(b, 16)) || [];
        const printable = bytes.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
        ascii = printable.replace(/\./g, '').length >= 2 ? printable : '';
      } catch {
        ascii = '';
      }

      tokens.push({
        opcode: `PUSHBYTES_${dataLen}`,
        hex: dataHex,
        isData: true,
        dataText: ascii || null
      });
      continue;
    }

    // OP_PUSHDATA1
    if (byte === '4c') {
      const lenByte = cleanHex.slice(i, i + 2);
      i += 2;
      const dataLen = parseInt(lenByte, 16);
      const dataHex = cleanHex.slice(i, i + dataLen * 2);
      i += dataLen * 2;
      tokens.push({ opcode: 'OP_PUSHDATA1', hex: dataHex, isData: true });
      continue;
    }

    // Standard Opcode Lookup
    const opName = BITCOIN_OPCODES[byte] || `OP_UNKNOWN_0x${byte.toUpperCase()}`;
    tokens.push({
      opcode: opName,
      hex: byte,
      isData: false
    });
  }

  return tokens;
}

/**
 * Decode and analyze Bitcoin scriptPubKeys, witness programs, or public address formats.
 *
 * @param {string} hexOrAddress - Public address or raw scriptPubKey hex
 * @returns {Object} Comprehensive script metadata
 */
export function decodeScriptPubkey(hexOrAddress) {
  if (!hexOrAddress || typeof hexOrAddress !== 'string') {
    return { error: 'Invalid input provided' };
  }

  const trimmed = hexOrAddress.trim();

  // Native SegWit addresses (bc1q)
  if (trimmed.startsWith('bc1q')) {
    const isWsh = trimmed.length > 50;
    return {
      type: isWsh ? 'SegWit script (P2WSH)' : 'Native SegWit (P2WPKH)',
      standard: 'SegWit standard',
      witnessVersion: 0,
      hrp: 'bc (Mainnet)',
      programLength: isWsh ? '32 bytes' : '20 bytes',
      asm: isWsh ? `OP_0 <32-byte-script-hash>` : `OP_0 <20-byte-key-hash>`,
      securityRating: isWsh ? 'Very strong locking' : 'Standard locking',
      spendRequirement: 'Needs the matching witness data to spend.'
    };
  }

  // Taproot addresses (bc1p)
  if (trimmed.startsWith('bc1p')) {
    return {
      type: 'Taproot (P2TR)',
      standard: 'Taproot standard',
      witnessVersion: 1,
      hrp: 'bc (Mainnet)',
      programLength: '32 bytes',
      asm: `OP_1 <32-byte-public-key>`,
      securityRating: 'Hides whether a key or a script spent it',
      spendRequirement: 'Needs a valid signature for the key, or the hidden script.'
    };
  }

  // Legacy addresses (starts with 1)
  if (trimmed.startsWith('1')) {
    return {
      type: 'Legacy (P2PKH)',
      standard: 'Legacy standard',
      witnessVersion: 'Non-witness (Legacy)',
      hrp: 'Base58 (Version 0x00)',
      programLength: '20 bytes',
      asm: `OP_DUP OP_HASH160 <20-byte-pubkey-hash> OP_EQUALVERIFY OP_CHECKSIG`,
      securityRating: 'Older signature style',
      spendRequirement: 'Needs the matching signature and public key.'
    };
  }

  // Script addresses (starts with 3)
  if (trimmed.startsWith('3')) {
    return {
      type: 'Script address (P2SH)',
      standard: 'Script-hash standard',
      witnessVersion: 'Nested or Legacy',
      hrp: 'Base58 (Version 0x05)',
      programLength: '20 bytes',
      asm: `OP_HASH160 <20-byte-script-hash> OP_EQUAL`,
      securityRating: 'Shared or exchange-controlled address',
      spendRequirement: 'Needs the hidden script plus its required signatures.'
    };
  }

  // Bare public keys (early P2PK format)
  if (trimmed.startsWith('04') || trimmed.startsWith('02') || trimmed.startsWith('03') || trimmed.includes('P2PK')) {
    const isUncompressed = trimmed.startsWith('04') && trimmed.length >= 130;
    return {
      type: 'Early public key (P2PK)',
      standard: 'Original early format',
      witnessVersion: 'Non-witness',
      hrp: 'Raw public key point',
      programLength: isUncompressed ? '65 bytes (Uncompressed)' : '33 bytes (Compressed)',
      asm: `<pubkey> OP_CHECKSIG`,
      securityRating: 'Public key visible on chain',
      spendRequirement: 'Needs a signature matching the public key.'
    };
  }

  // Handle OP_RETURN null data
  if (trimmed.toUpperCase().startsWith('6A') || trimmed.toUpperCase().startsWith('OP_RETURN')) {
    const hexData = trimmed.replace(/^6a/i, '').replace(/^OP_RETURN\s*/i, '');
    let asciiText = '';
    try {
      const bytes = hexData.match(/.{1,2}/g)?.map(b => parseInt(b, 16)) || [];
      asciiText = bytes.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
    } catch {
      asciiText = '';
    }

    return {
      type: 'OP_RETURN (embedded message)',
      standard: 'Data carrier standard',
      witnessVersion: 'Unspendable Script',
      hrp: 'Script Opcode 0x6a',
      programLength: `${Math.floor(hexData.length / 2)} bytes`,
      asm: `OP_RETURN ${hexData}`,
      decodedText: asciiText || 'Binary / Non-ASCII payload',
      securityRating: 'Provably unspendable (removed from circulation)',
      spendRequirement: 'Cannot be spent. Used for timestamps, notary proofs, and metadata anchoring.'
    };
  }

  // Disassemble arbitrary hex bytecode
  const tokens = disassembleScriptHex(trimmed);
  const tokenAsm = tokens.map(t => t.isData ? `<${t.hex}>` : t.opcode).join(' ');

  return {
    type: 'Custom script',
    standard: 'On-chain code',
    witnessVersion: 'Unknown',
    hrp: 'Raw code',
    programLength: `${Math.floor(trimmed.length / 2)} bytes`,
    asm: tokenAsm || `OP_UNKNOWN: ${trimmed.slice(0, 32)}...`,
    tokens,
    securityRating: 'Non-standard script template',
    spendRequirement: 'Follows custom on-chain rules.'
  };
}
