import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MetadataSidebar from './MetadataSidebar';

// Mock child hooks
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() })
}));

vi.mock('../../hooks/useWatchlist', () => ({
  useWatchlist: () => ({
    isWatched: () => false,
    toggle: () => 'added'
  })
}));

vi.mock('../../hooks/useEndpointProfile', () => ({
  useEndpointProfile: () => ({
    status: 'idle',
    profile: null
  })
}));

describe('MetadataSidebar P3 & P4 Forensics UI', () => {
  it('renders collapsed input cluster card with address list and uncollapse action', () => {
    const setIsClusterCollapsed = vi.fn();
    const onExpandAddress = vi.fn();

    const clusterNode = {
      id: 'cluster_tx_fanin',
      type: 'cluster',
      label: 'Cluster (4 Inputs)',
      entityName: 'CIOH Cluster (4 Addrs)',
      balance: '12.5000 BTC',
      isCollapsedCluster: true,
      targetTxId: 'tx_fanin',
      details: {
        addressCount: 4,
        totalBalance: '12.5000 BTC'
      },
      subNodes: [
        { id: 'addr_1', balance: '3.0000 BTC', details: { address: '1InputA11111111111111111111111111' } },
        { id: 'addr_2', balance: '4.5000 BTC', details: { address: '1InputB22222222222222222222222222' } },
        { id: 'addr_3', balance: '5.0000 BTC', details: { address: '1InputC33333333333333333333333333' } }
      ]
    };

    render(
      <MetadataSidebar
        selectedNode={clusterNode}
        activeCase={{ nodes: [clusterNode], links: [] }}
        isClusterCollapsed={true}
        setIsClusterCollapsed={setIsClusterCollapsed}
        onExpandAddress={onExpandAddress}
      />
    );

    expect(screen.getByText(/COLLAPSED INPUT CLUSTER/i)).toBeDefined();
    expect(screen.getByText(/CIOH Cluster \(4 Addrs\)/i)).toBeDefined();
    expect(screen.getByText(/Uncollapse/i)).toBeDefined();

    // Verify uncollapse interaction
    fireEvent.click(screen.getByText(/Uncollapse/i));
    expect(setIsClusterCollapsed).toHaveBeenCalledWith(false);
  });

  it('renders Lightning Network / HTLC forensics card when HTLC script is detected', () => {
    const lightningNode = {
      id: 'node_htlc_hop',
      type: 'hop',
      entityName: 'Boltz HTLC Swap',
      balance: '0.4500 BTC',
      details: {
        address: '3BoltzSwapHTLCAddress11111111111',
        scriptStandard: 'HTLC',
        scriptPubkeyHex: 'a91423456789abcdef0123456789abcdef01234567898763b175'
      }
    };

    render(
      <MetadataSidebar
        selectedNode={lightningNode}
        activeCase={{ nodes: [lightningNode], links: [] }}
      />
    );

    expect(screen.getByText(/Atomic Submarine Swap/i)).toBeDefined();
    expect(screen.getByText(/Layer-1 to LN Bridge/i)).toBeDefined();
  });

  it('renders Multi-Chain EVM / TRON USDT contract inspector card', () => {
    const crossChainNode = {
      id: 'node_bridge_out',
      type: 'bridge',
      entityName: 'Thorchain Cross-Chain Vault',
      balance: '2.5000 BTC',
      details: {
        address: 'bc1qthorvaultaddress11111111111111111',
        crossChain: {
          destinationChain: 'Ethereum',
          destinationAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          targetAsset: 'USDT'
        }
      }
    };

    render(
      <MetadataSidebar
        selectedNode={crossChainNode}
        activeCase={{ nodes: [crossChainNode], links: [] }}
      />
    );

    expect(screen.getByText(/CROSS-CHAIN SWAP/i)).toBeDefined();
    expect(screen.getByText(/Ethereum \(USDT\)/i)).toBeDefined();
    // USDT Token contract on Ethereum
    expect(screen.getByText(/USDT Token Contract \(ERC-20\)/i)).toBeDefined();
    expect(screen.getByText(/0xdAC17F958D2ee523a2206206994597C13D831ec7/i)).toBeDefined();
  });
});
