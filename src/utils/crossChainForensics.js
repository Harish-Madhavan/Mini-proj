/**
 * AegisTrace Cross-Chain Bridge & Protocol Forensics Engine
 * Analyzes on-chain Bitcoin transactions for chain-hopping obfuscation:
 * - Cross-chain bridge memos (THORChain, Maya Protocol, SideShift, Portal)
 * - Non-custodial swap routers (ChangeNOW, FixedFloat, SimpleSwap)
 * - Multi-chain destination address extraction (Ethereum, Tron, Solana, Monero)
 * - Cross-chain jump attribution and legal notice data preparation
 */

import { parseBtcAmount } from './forensicUtils';

export const CROSS_CHAIN_NETWORKS = {
  ETH: { name: 'Ethereum', symbol: 'ETH', standard: 'ERC-20', explorer: 'https://etherscan.io/address/' },
  TRX: { name: 'Tron', symbol: 'TRX', standard: 'TRC-20', explorer: 'https://tronscan.org/#/address/' },
  SOL: { name: 'Solana', symbol: 'SOL', standard: 'SPL', explorer: 'https://solscan.io/account/' },
  BSC: { name: 'BNB Smart Chain', symbol: 'BNB', standard: 'BEP-20', explorer: 'https://bscscan.com/address/' },
  ARB: { name: 'Arbitrum One', symbol: 'ETH', standard: 'ERC-20', explorer: 'https://arbiscan.io/address/' },
  OP: { name: 'Optimism', symbol: 'ETH', standard: 'ERC-20', explorer: 'https://optimistic.etherscan.io/address/' },
  MATIC: { name: 'Polygon', symbol: 'POL', standard: 'ERC-20', explorer: 'https://polygonscan.com/address/' },
  POL: { name: 'Polygon', symbol: 'POL', standard: 'ERC-20', explorer: 'https://polygonscan.com/address/' },
  XMR: { name: 'Monero', symbol: 'XMR', standard: 'Privacy Coin', explorer: null },
  AVAX: { name: 'Avalanche', symbol: 'AVAX', standard: 'ARC-20', explorer: 'https://snowtrace.io/address/' }
};

export const BRIDGE_PROVIDERS = [
  {
    id: 'thorchain',
    name: 'THORChain Asgard Vault',
    type: 'Decentralized Cross-Chain Liquidity Protocol',
    pattern: 'bc1qthor',
    riskLevel: 'CRITICAL',
    memoPrefixes: ['SWAP', 's', '=', 'ADD', '+', 'OUT'],
    notes: 'Non-custodial cross-chain AMM; funds move directly to secondary chains without KYC.'
  },
  {
    id: 'mayaprotocol',
    name: 'Maya Protocol Cross-Chain Liquidity',
    type: 'Decentralized Cross-Chain Liquidity Protocol',
    pattern: 'bc1qmaya',
    riskLevel: 'CRITICAL',
    memoPrefixes: ['MAYAN', 'm', 'SWAP'],
    notes: 'Friendly fork of THORChain providing non-custodial cross-chain swaps without KYC.'
  },
  {
    id: 'sideshift',
    name: 'SideShift AI Router',
    type: 'Instant No-KYC Cross-Chain Swap',
    pattern: '3Side',
    riskLevel: 'HIGH',
    memoPrefixes: ['SIDESHIFT', 'SSH'],
    notes: 'Automated rapid coin-to-coin shifting; commonly used for fast asset conversion.'
  },
  {
    id: 'changenow',
    name: 'ChangeNOW Bridge',
    type: 'Non-Custodial Multi-Currency Exchange',
    pattern: 'bc1qchg',
    riskLevel: 'HIGH',
    memoPrefixes: ['CNOW'],
    notes: 'Fast exchange gateway bridging Bitcoin into privacy coins or Tron USDT.'
  },
  {
    id: 'fixedfloat',
    name: 'FixedFloat Lightning & Cross-Chain',
    type: 'Automated Instant Cryptocurrency Exchanger',
    pattern: '1Fixed',
    riskLevel: 'HIGH',
    memoPrefixes: ['FF'],
    notes: 'Automated swap router; frequently flagged in ransomware exit layering.'
  },
  {
    id: 'symbiosis',
    name: 'Symbiosis Protocol',
    type: 'Decentralized Cross-Chain AMM',
    pattern: 'symbiosis',
    riskLevel: 'HIGH',
    memoPrefixes: ['SIS', 'SYMBIOSIS'],
    notes: 'Cross-chain liquidity protocol routing through decentralized pool contracts.'
  }
];

/**
 * Safely decodes hexadecimal OP_RETURN script or pushdata payload into ASCII string.
 * Strips Bitcoin OP_RETURN opcode (0x6a) and pushdata length headers if present.
 */
export function decodeHexToAscii(hexStr) {
  if (!hexStr || typeof hexStr !== 'string') return '';
  const cleanHex = hexStr.replace(/^0x/i, '').replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]+$/.test(cleanHex) || cleanHex.length < 2 || cleanHex.length % 2 !== 0) return '';

  let offset = 0;
  // If starts with OP_RETURN (0x6a)
  if (cleanHex.toLowerCase().startsWith('6a')) {
    offset = 2;
    if (cleanHex.length >= 4) {
      const firstByte = parseInt(cleanHex.substring(offset, offset + 2), 16);
      if (firstByte <= 75) {
        offset += 2;
      } else if (firstByte === 0x4c && cleanHex.length >= 6) { // OP_PUSHDATA1
        offset += 4;
      }
    }
  }

  let str = '';
  for (let i = offset; i < cleanHex.length; i += 2) {
    const code = parseInt(cleanHex.substring(i, i + 2), 16);
    if (code >= 32 && code <= 126) {
      str += String.fromCharCode(code);
    }
  }
  return str.trim();
}

/**
 * Parses and decodes cross-chain bridge memos often embedded in OP_RETURN or tx notes.
 * Supported syntax:
 * - THORChain: SWAP:CHAIN.ASSET:DEST_ADDRESS:LIM or =:CHAIN.ASSET:DEST_ADDRESS
 * - SideShift: SIDESHIFT:DEST_ADDRESS:ASSET
 * - Generic: BRIDGE:CHAIN:DEST_ADDRESS
 */
export function parseCrossChainMemo(memo) {
  if (!memo || typeof memo !== 'string') return null;
  let raw = memo.trim();

  // If input appears to be hex-encoded OP_RETURN data
  if (/^(?:6a|0x)?[0-9a-fA-F]{10,}$/.test(raw) && !raw.includes(':') && !raw.includes(' ')) {
    const decoded = decodeHexToAscii(raw);
    if (decoded && (decoded.includes(':') || decoded.startsWith('SWAP') || decoded.startsWith('='))) {
      raw = decoded;
    }
  }

  // Strip surrounding quotes or "RETURN " / "OP_RETURN " prefix if present
  const clean = raw.replace(/^["']|["']$/g, '').replace(/^(?:OP_)?RETURN\s+/i, '').trim();

  // Match THORChain / Maya standard memo: SWAP:CHAIN.ASSET:ADDRESS or =:CHAIN.ASSET:ADDRESS
  const thorMatch = clean.match(/^(?:SWAP|s|=|MAYAN|m):([A-Z0-9]+)\.([A-Z0-9\-_]+):([a-zA-Z0-9_]+)(?::([^:\s]+))?/i);
  if (thorMatch) {
    const chainCode = thorMatch[1].toUpperCase();
    const asset = thorMatch[2].toUpperCase();
    const destAddr = thorMatch[3];
    const isMaya = /^m|^mayan/i.test(clean);
    const network = CROSS_CHAIN_NETWORKS[chainCode] || { name: chainCode, symbol: chainCode, explorer: null };

    return {
      isCrossChain: true,
      protocol: isMaya ? 'Maya Protocol' : 'THORChain / Maya Protocol',
      action: 'SWAP',
      destinationChain: network.name,
      destinationChainCode: chainCode,
      targetAsset: asset,
      destinationAddress: destAddr,
      explorerUrl: network.explorer ? `${network.explorer}${destAddr}` : null,
      rawMemo: raw
    };
  }

  // Match SideShift / Generic memo format: e.g. "SIDESHIFT:0x71C...:USDT" or "BRIDGE:ETH:0x..."
  const genericMatch = clean.match(/^(?:BRIDGE|SIDESHIFT|SWAP):([A-Z0-9]+):([a-zA-Z0-9_]+)(?::([A-Z0-9]+))?/i);
  if (genericMatch) {
    const chainOrProvider = genericMatch[1].toUpperCase();
    const destAddr = genericMatch[2];
    const asset = genericMatch[3] ? genericMatch[3].toUpperCase() : 'NATIVE';
    const chainCode = CROSS_CHAIN_NETWORKS[chainOrProvider] ? chainOrProvider : destAddr.startsWith('0x') ? 'ETH' : destAddr.startsWith('T') ? 'TRX' : 'UNKNOWN';
    const network = CROSS_CHAIN_NETWORKS[chainCode] || { name: chainCode, symbol: chainCode, explorer: null };

    return {
      isCrossChain: true,
      protocol: chainOrProvider.includes('SIDE') ? 'SideShift AI' : 'Cross-Chain Bridge',
      action: 'SWAP',
      destinationChain: network.name,
      destinationChainCode: chainCode,
      targetAsset: asset,
      destinationAddress: destAddr,
      explorerUrl: network.explorer ? `${network.explorer}${destAddr}` : null,
      rawMemo: raw
    };
  }

  // Check if string contains an EVM 0x address
  const evmMatch = clean.match(/(0x[a-fA-F0-9]{40})/);
  if (evmMatch) {
    return {
      isCrossChain: true,
      protocol: 'Cross-Chain Swap (EVM Target)',
      action: 'SWAP',
      destinationChain: 'Ethereum / EVM',
      destinationChainCode: 'ETH',
      targetAsset: 'ERC-20 Asset',
      destinationAddress: evmMatch[1],
      explorerUrl: `https://etherscan.io/address/${evmMatch[1]}`,
      rawMemo: raw
    };
  }

  // Check if string contains a Tron Base58 address (starts with T, 34 alphanumeric chars)
  const tronMatch = clean.match(/\b(T[a-km-zA-HJ-NP-Z1-9]{33})\b/);
  if (tronMatch && !clean.startsWith('bc1') && !clean.startsWith('1') && !clean.startsWith('3')) {
    return {
      isCrossChain: true,
      protocol: 'Cross-Chain Swap (Tron Target)',
      action: 'SWAP',
      destinationChain: 'Tron',
      destinationChainCode: 'TRX',
      targetAsset: 'TRC-20 Asset',
      destinationAddress: tronMatch[1],
      explorerUrl: `https://tronscan.org/#/address/${tronMatch[1]}`,
      rawMemo: raw
    };
  }

  return null;
}

/**
 * Checks whether a node represents a known cross-chain bridge vault or swap router
 */
export function identifyBridgeEntity(node) {
  if (!node) return null;
  const addr = node.details?.address || node.id || '';
  const label = node.entityName || node.label || '';

  for (const provider of BRIDGE_PROVIDERS) {
    if (addr.toLowerCase().includes(provider.pattern.toLowerCase()) || 
        label.toLowerCase().includes(provider.id) ||
        label.toLowerCase().includes(provider.name.toLowerCase())) {
      return provider;
    }
  }

  if (/bridge|cross-chain|instant swap|chain-hop/i.test(label) || /bridge|crosschain/i.test(addr)) {
    return {
      id: 'generic-bridge',
      name: label || 'Unattributed Cross-Chain Bridge',
      type: 'Cross-Chain Router',
      riskLevel: 'HIGH',
      notes: 'Suspected cross-chain settlement node'
    };
  }

  return null;
}

/**
 * Analyzes case graph for cross-chain hops, bridge vaults, and swap memos
 */
export function analyzeCaseCrossChainActivity(nodes = [], _links = []) {
  const bridgeHops = [];
  const targetChains = new Set();
  let totalBridgeValueBtc = 0;

  nodes.forEach(node => {
    const bridgeEntity = identifyBridgeEntity(node);
    const memo = node.details?.opReturnDecoded || node.details?.opReturnHex || node.details?.memo || null;
    const parsedMemo = memo ? parseCrossChainMemo(memo) : null;

    if (bridgeEntity || parsedMemo || node.details?.crossChain) {
      const destChain = parsedMemo?.destinationChain || node.details?.crossChain?.destinationChain || 'Ethereum';
      const destAddr = parsedMemo?.destinationAddress || node.details?.crossChain?.destinationAddress || 'N/A';
      const asset = parsedMemo?.targetAsset || node.details?.crossChain?.targetAsset || 'USDT';
      const val = parseBtcAmount(node.balance);

      totalBridgeValueBtc += val;
      targetChains.add(destChain);

      bridgeHops.push({
        nodeId: node.id,
        nodeLabel: node.label || node.entityName,
        bridgeName: bridgeEntity?.name || parsedMemo?.protocol || 'Cross-Chain Protocol',
        bridgeType: bridgeEntity?.type || 'Non-Custodial Bridge',
        riskLevel: bridgeEntity?.riskLevel || 'HIGH',
        destinationChain: destChain,
        destinationAddress: destAddr,
        targetAsset: asset,
        explorerUrl: parsedMemo?.explorerUrl || (destAddr.startsWith('0x') ? `https://etherscan.io/address/${destAddr}` : destAddr.startsWith('T') ? `https://tronscan.org/#/address/${destAddr}` : null),
        memo: parsedMemo?.rawMemo || null,
        valueBtc: val
      });
    }
  });

  const detected = bridgeHops.length > 0;

  return {
    detected,
    bridgeCount: bridgeHops.length,
    hops: bridgeHops,
    targetChains: Array.from(targetChains),
    totalBridgeValueBtc: totalBridgeValueBtc.toFixed(4),
    riskPenalty: detected ? Math.min(30, bridgeHops.length * 15) : 0,
    summary: detected
      ? `Detected ${bridgeHops.length} cross-chain bridge hop(s) exiting into ${Array.from(targetChains).join(', ')}.`
      : 'No cross-chain bridges or swap memos identified in current graph.'
  };
}
