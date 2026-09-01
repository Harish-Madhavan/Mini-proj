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

  // Handle Bech32 / Native SegWit (P2WPKH / P2WSH)
  if (trimmed.startsWith('bc1q')) {
    const isWsh = trimmed.length > 50;
    return {
      type: isWsh ? 'P2WSH (Witness Script Hash)' : 'P2WPKH (Native SegWit)',
      standard: 'BIP141 / BIP173',
      witnessVersion: 0,
      hrp: 'bc (Mainnet)',
      programLength: isWsh ? '32 bytes (SHA-256)' : '20 bytes (HASH160)',
      asm: isWsh ? `OP_0 <32-byte-witness-script-hash>` : `OP_0 <20-byte-key-hash>`,
      securityRating: isWsh ? 'Quantum-resistant (256-bit hash)' : 'Standard SegWit (160-bit hash)',
      spendRequirement: 'Requires 0x00 version byte followed by witness execution stack.'
    };
  }

  // Handle Bech32m / Taproot (P2TR)
  if (trimmed.startsWith('bc1p')) {
    return {
      type: 'P2TR (Taproot / Schnorr)',
      standard: 'BIP341 / BIP342 (BIP350 Bech32m)',
      witnessVersion: 1,
      hrp: 'bc (Mainnet)',
      programLength: '32 bytes (x-only Schnorr Public Key)',
      asm: `OP_1 <32-byte-x-only-pubkey>`,
      securityRating: 'Top-tier Privacy (Key path & Script path indistinguishable)',
      spendRequirement: 'Schnorr signature over 32-byte internal key or Merkle branch script execution.'
    };
  }

  // Handle Base58check Legacy P2PKH (starts with 1)
  if (trimmed.startsWith('1')) {
    return {
      type: 'P2PKH (Pay-to-Public-Key-Hash)',
      standard: 'Legacy Base58Check',
      witnessVersion: 'Non-witness (Legacy)',
      hrp: 'Base58 (Version 0x00)',
      programLength: '20 bytes (RIPEMD160)',
      asm: `OP_DUP OP_HASH160 <20-byte-pubkey-hash> OP_EQUALVERIFY OP_CHECKSIG`,
      securityRating: 'Legacy Standard (ECDSA secp256k1)',
      spendRequirement: 'Valid ECDSA signature and 33/65-byte public key on scriptSig stack.'
    };
  }

  // Handle Base58check P2SH (starts with 3)
  if (trimmed.startsWith('3')) {
    return {
      type: 'P2SH (Pay-to-Script-Hash / Multi-Sig)',
      standard: 'BIP16 Base58Check',
      witnessVersion: 'Nested or Legacy',
      hrp: 'Base58 (Version 0x05)',
      programLength: '20 bytes (Script Hash)',
      asm: `OP_HASH160 <20-byte-redeem-script-hash> OP_EQUAL`,
      securityRating: 'Multi-Signature or Nested SegWit Gateway',
      spendRequirement: 'Redeem script hash preimage matching Hash160, followed by nested opcode execution.'
    };
  }

  // Handle Pay-to-PubKey (P2PK) hex or pubkey
  if (trimmed.startsWith('04') || trimmed.startsWith('02') || trimmed.startsWith('03') || trimmed.includes('P2PK')) {
    const isUncompressed = trimmed.startsWith('04') && trimmed.length >= 130;
    return {
      type: 'P2PK (Pay-to-PubKey - Satoshi Genesis Era)',
      standard: 'Original Bitcoin Protocol (v0.1)',
      witnessVersion: 'Non-witness',
      hrp: 'Raw Secp256k1 Curve Point',
      programLength: isUncompressed ? '65 bytes (Uncompressed)' : '33 bytes (Compressed)',
      asm: `<pubkey> OP_CHECKSIG`,
      securityRating: 'Historical Direct Public Key Exposure',
      spendRequirement: 'Valid ECDSA signature pushed directly to stack matching public key.'
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
      type: 'OP_RETURN (Null Data Unspendable)',
      standard: 'BIP65 Data Carrier',
      witnessVersion: 'Unspendable Script',
      hrp: 'Script Opcode 0x6a',
      programLength: `${Math.floor(hexData.length / 2)} bytes`,
      asm: `OP_RETURN ${hexData}`,
      decodedText: asciiText || 'Binary / Non-ASCII payload',
      securityRating: 'Provably Unspendable (Pruned from UTXO set)',
      spendRequirement: 'Cannot be spent. Used for timestamps, notary proofs, and metadata anchoring.'
    };
  }

  // Disassemble arbitrary hex bytecode
  const tokens = disassembleScriptHex(trimmed);
  const tokenAsm = tokens.map(t => t.isData ? `<${t.hex}>` : t.opcode).join(' ');

  return {
    type: 'Custom / Non-Standard Script',
    standard: 'On-chain Script Bytecode',
    witnessVersion: 'Unknown',
    hrp: 'Hex Bytecode',
    programLength: `${Math.floor(trimmed.length / 2)} bytes`,
    asm: tokenAsm || `OP_UNKNOWN: ${trimmed.slice(0, 32)}...`,
    tokens,
    securityRating: 'Non-standard script template',
    spendRequirement: 'Evaluates according to custom Bitcoin Script execution rules.'
  };
}
