import { describe, it, expect } from 'vitest';
import { 
  parseCrossChainMemo, 
  identifyBridgeEntity, 
  analyzeCaseCrossChainActivity 
} from './crossChainForensics';

describe('crossChainForensics Engine', () => {
  it('correctly decodes standard THORChain cross-chain swap memos', () => {
    const memo = 'SWAP:ETH.USDT:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045:100000';
    const result = parseCrossChainMemo(memo);

    expect(result).not.toBeNull();
    expect(result.isCrossChain).toBe(true);
    expect(result.destinationChain).toBe('Ethereum');
    expect(result.targetAsset).toBe('USDT');
    expect(result.destinationAddress).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    expect(result.explorerUrl).toBe('https://etherscan.io/address/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
  });

  it('decodes abbreviated THORChain swap memos (=:CHAIN.ASSET:ADDR)', () => {
    const memo = '=:TRX.USDT:TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7';
    const result = parseCrossChainMemo(memo);

    expect(result).not.toBeNull();
    expect(result.destinationChain).toBe('Tron');
    expect(result.targetAsset).toBe('USDT');
    expect(result.destinationAddress).toBe('TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7');
    expect(result.explorerUrl).toBe('https://tronscan.org/#/address/TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7');
  });

  it('identifies known bridge entities and vaults from node attributes', () => {
    const thorNode = {
      id: 'vault_thor',
      label: 'THORChain Asgard Vault',
      details: { address: 'bc1qthorvault9981247asgard001' }
    };
    const identified = identifyBridgeEntity(thorNode);

    expect(identified).not.toBeNull();
    expect(identified.id).toBe('thorchain');
    expect(identified.riskLevel).toBe('CRITICAL');
  });

  it('analyzes case graph nodes and flags cross-chain chain-hopping', () => {
    const mockNodes = [
      { id: 'suspect', type: 'suspect', balance: '2.5 BTC' },
      { 
        id: 'bridge_node', 
        type: 'hop', 
        label: 'THORChain Swap Vault', 
        balance: '2.48 BTC',
        details: { 
          address: 'bc1qthorvault9981247asgard001',
          opReturnDecoded: 'SWAP:ETH.USDT:0x71C8389370415be37b78901D92E43f656821d374'
        }
      }
    ];

    const analysis = analyzeCaseCrossChainActivity(mockNodes, []);
    expect(analysis.detected).toBe(true);
    expect(analysis.bridgeCount).toBe(1);
    expect(analysis.targetChains).toContain('Ethereum');
    expect(analysis.hops[0].destinationAddress).toBe('0x71C8389370415be37b78901D92E43f656821d374');
    expect(analysis.riskPenalty).toBeGreaterThan(0);
  });

  it('returns clean empty analysis when no bridges are present', () => {
    const cleanNodes = [
      { id: 'suspect', type: 'suspect', balance: '1.0 BTC' },
      { id: 'hop', type: 'hop', balance: '0.99 BTC', details: { address: 'bc1qstandardhopaddr' } }
    ];
    const analysis = analyzeCaseCrossChainActivity(cleanNodes, []);
    expect(analysis.detected).toBe(false);
    expect(analysis.bridgeCount).toBe(0);
    expect(analysis.riskPenalty).toBe(0);
  });

  it('handles Maya Protocol memos and strip quotes/prefixes correctly', () => {
    const quotedMaya = '"MAYAN:ETH.USDT:0x71C8364437F5Fa0128509890F0D8E8170D30d6F9:1000/10/100"';
    const res = parseCrossChainMemo(quotedMaya);
    expect(res).not.toBeNull();
    expect(res.protocol).toBe('Maya Protocol');
    expect(res.destinationChain).toBe('Ethereum');
    expect(res.destinationAddress).toBe('0x71C8364437F5Fa0128509890F0D8E8170D30d6F9');
  });

  it('parses raw Tron TRC-20 destination addresses in transaction notes', () => {
    const rawTronNote = 'Chain-hop exit to Tron wallet: TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7';
    const res = parseCrossChainMemo(rawTronNote);
    expect(res).not.toBeNull();
    expect(res.destinationChain).toBe('Tron');
    expect(res.destinationAddress).toBe('TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7');
    expect(res.explorerUrl).toBe('https://tronscan.org/#/address/TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7');
  });

  it('decodes raw hex-encoded OP_RETURN scripts into ASCII memos', () => {
    // ASCII for "SWAP:ARB.ETH:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
    // Prefixed with OP_RETURN (6a) and pushdata length (30 hex = 48 bytes)
    const rawHex = '6a30535741503a4152422e4554483a307864386441364246323639363461463944376545643965303345353334313544333761413936303435';
    const res = parseCrossChainMemo(rawHex);

    expect(res).not.toBeNull();
    expect(res.destinationChain).toBe('Arbitrum One');
    expect(res.targetAsset).toBe('ETH');
    expect(res.destinationAddress).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    expect(res.explorerUrl).toBe('https://arbiscan.io/address/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
  });

  it('identifies Maya Protocol and Symbiosis bridge nodes', () => {
    const mayaNode = { id: 'm1', label: 'Maya Protocol Vault', details: { address: 'bc1qmaya9981247asgard001' } };
    const sisNode = { id: 's1', label: 'Symbiosis Cross-Chain AMM', details: { address: 'bc1qsymbiosisrouter001' } };

    expect(identifyBridgeEntity(mayaNode)?.id).toBe('mayaprotocol');
    expect(identifyBridgeEntity(sisNode)?.id).toBe('symbiosis');
  });
});
