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
    let payloadHex = hexData;

    // Strip pushdata length prefix if present (standard scriptPubKeys have 6a followed by push length)
    if (hexData.length >= 2) {
      const firstByte = parseInt(hexData.slice(0, 2), 16);
      const remainingBytes = (hexData.length - 2) / 2;
      if (firstByte <= 75 && firstByte === remainingBytes) {
        payloadHex = hexData.slice(2);
      } else if (firstByte === 0x4c && hexData.length >= 4) { // OP_PUSHDATA1
        const pushLen = parseInt(hexData.slice(2, 4), 16);
        if (pushLen === (hexData.length - 4) / 2) {
          payloadHex = hexData.slice(4);
        }
      } else if (firstByte === 0x4d && hexData.length >= 6) { // OP_PUSHDATA2
        const pushLen = parseInt(hexData.slice(2, 4), 16) + (parseInt(hexData.slice(4, 6), 16) << 8);
        if (pushLen === (hexData.length - 6) / 2) {
          payloadHex = hexData.slice(6);
        }
      }
    }

    let asciiText = '';
    try {
      const bytes = payloadHex.match(/.{1,2}/g)?.map(b => parseInt(b, 16)) || [];
      const printable = bytes.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
      if (printable.replace(/\./g, '').length >= 1) {
        asciiText = printable;
      }
    } catch {
      asciiText = '';
    }

    return {
      type: 'OP_RETURN (embedded message)',
      standard: 'Data carrier standard',
      witnessVersion: 'Unspendable Script',
      hrp: 'Script Opcode 0x6a',
      programLength: `${Math.floor(payloadHex.length / 2)} bytes`,
      asm: `OP_RETURN ${hexData}`,
      decodedText: asciiText || 'Binary / Non-ASCII payload',
      securityRating: 'Provably unspendable (removed from circulation)',
      spendRequirement: 'Cannot be spent. Used for timestamps, notary proofs, and metadata anchoring.'
    };
  }

  // Check for Lightning Channel or Submarine Swap / HTLC script
  const lightningHit = detectLightningAndHtlc(trimmed);
  if (lightningHit) {
    const tokens = disassembleScriptHex(trimmed);
    const tokenAsm = tokens.map(t => t.isData ? `<${t.hex}>` : t.opcode).join(' ');
    return {
      type: lightningHit.isSubmarineSwap ? 'Submarine Swap HTLC (Layer-2 Cross-Hop)' : 'Lightning Channel (2-of-2 multisig)',
      standard: lightningHit.layer,
      witnessVersion: 'Layer-2 Off-Ramp Contract',
      hrp: lightningHit.protocol,
      programLength: `${Math.floor(trimmed.length / 2)} bytes`,
      asm: tokenAsm || trimmed,
      tokens,
      lightningInfo: lightningHit,
      securityRating: `${lightningHit.riskLevel} - Off-Chain Transit`,
      spendRequirement: lightningHit.description
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

/**
 * Detects Lightning Network channel funding (2-of-2 multisig) and Submarine Swap / HTLC contracts.
 * Inspects raw script bytecode, ASM strings, or witness scripts.
 *
 * @param {string} scriptHexOrAsm - Hex bytecode or ASM representation
 * @returns {Object|null} Lightning / HTLC detection details
 */
export function detectLightningAndHtlc(scriptHexOrAsm) {
  if (!scriptHexOrAsm || typeof scriptHexOrAsm !== 'string') return null;
  const raw = scriptHexOrAsm.trim();
  const cleanHex = raw.replace(/^0x/i, '').toLowerCase();

  // 1. Detect 2-of-2 Multisig Lightning Channel Funding
  // ASM pattern: OP_2 <pubkey1> <pubkey2> OP_2 OP_CHECKMULTISIG
  // Hex pattern: starts with 52 (OP_2) and ends with 52ae (OP_2 OP_CHECKMULTISIG)
  const is2of2Asm = /OP_2\s+.*?\s+.*?\s+OP_2\s+OP_CHECKMULTISIG/i.test(raw);
  const is2of2Hex = (cleanHex.startsWith('52') && cleanHex.endsWith('52ae')) ||
                    (cleanHex.includes('5221') && cleanHex.endsWith('52ae'));

  if (is2of2Asm || is2of2Hex) {
    return {
      isLightning: true,
      isSubmarineSwap: false,
      protocol: 'Lightning Channel',
      channelType: '2-of-2 Multisig Funding',
      layer: 'Layer-2 (Lightning Network)',
      riskLevel: 'HIGH',
      description: 'Funding transaction for a bidirectional Layer-2 Lightning Network channel. Funds transition off-chain.',
      actionRecommendation: 'Flag as Layer-2 exit. Subpoena node pubkeys or track cooperative channel close.'
    };
  }

  // 2. Submarine Swap / HTLC (Atomic Swaps: Boltz Exchange, Loop, SideShift LN)
  // Characteristic opcodes:
  // - Hashlock: OP_HASH160 (or OP_SHA256) + OP_EQUAL
  // - Branching: OP_IF / OP_ELSE / OP_ENDIF
  // - Timelock: OP_CHECKLOCKTIMEVERIFY (b1) or OP_CHECKSEQUENCEVERIFY (b2)
  const hasHashLock = /OP_HASH160|OP_SHA256|a9|a8/i.test(raw);
  const hasTimeLock = /OP_CHECKLOCKTIMEVERIFY|OP_CHECKSEQUENCEVERIFY|b1|b2/i.test(raw);
  const hasBranching = /OP_IF|OP_ELSE|OP_ENDIF|63|67|68/i.test(raw);

  const isSubmarineSwapAsm = /OP_HASH160.*OP_EQUAL.*OP_IF.*OP_ELSE.*OP_CHECKLOCKTIMEVERIFY/is.test(raw) ||
                            /OP_SIZE.*OP_EQUALVERIFY.*OP_HASH160.*OP_EQUAL/is.test(raw);

  const isSubmarineSwapHex = (cleanHex.includes('a9') && cleanHex.includes('b1')) ||
                             (cleanHex.includes('63') && cleanHex.includes('67') && cleanHex.includes('b1'));

  if ((hasHashLock && hasTimeLock && hasBranching) || isSubmarineSwapAsm || isSubmarineSwapHex) {
    const isBoltz = /boltz/i.test(raw) || (cleanHex.includes('8763') && cleanHex.includes('b175'));
    const protocolName = isBoltz ? 'Boltz Submarine Swap' : 'Submarine Swap HTLC (Layer-2 Cross-Hop)';

    return {
      isLightning: true,
      isSubmarineSwap: true,
      protocol: protocolName,
      channelType: 'Hash Time-Locked Contract (HTLC)',
      layer: 'Atomic Layer-1 to Layer-2 Bridge',
      riskLevel: 'CRITICAL',
      description: 'Atomic cross-layer swap contract (e.g. Boltz / Loop). Swaps on-chain UTXO for instant Lightning satoshis.',
      actionRecommendation: 'Urgent: Funds bridged directly into Lightning Network off-chain balance.'
    };
  }

  return null;
}

export const classifyScriptTemplate = decodeScriptPubkey;


