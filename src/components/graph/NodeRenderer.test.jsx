import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import NodeRenderer from './NodeRenderer';

describe('NodeRenderer P3 & P4 Badge Visuals', () => {
  const getNodeCoords = vi.fn((_id) => ({ x: 100, y: 100 }));
  const onNodeMouseDown = vi.fn();
  const onSelectNode = vi.fn();

  it('renders cluster nodes with ☷ badge and address count', () => {
    const clusterNode = {
      id: 'cluster_tx_123',
      type: 'cluster',
      label: 'Cluster (5)',
      isCollapsedCluster: true,
      details: { addressCount: 5 }
    };

    const { container } = render(
      <svg>
        <NodeRenderer
          nodes={[clusterNode]}
          links={[]}
          getNodeCoords={getNodeCoords}
          selectedNode={null}
          onNodeMouseDown={onNodeMouseDown}
          onSelectNode={onSelectNode}
        />
      </svg>
    );

    // Look for cluster symbol in text element
    const clusterBadge = container.querySelector('text');
    expect(clusterBadge).not.toBeNull();
    expect(container.textContent).toContain('☷ 5');
  });

  it('renders lightning node with ⚡ badge', () => {
    const lightningNode = {
      id: 'node_ln_1',
      type: 'hop',
      label: 'LN Hop',
      details: { scriptStandard: 'HTLC' }
    };

    const { container } = render(
      <svg>
        <NodeRenderer
          nodes={[lightningNode]}
          links={[]}
          getNodeCoords={getNodeCoords}
          selectedNode={null}
          onNodeMouseDown={onNodeMouseDown}
          onSelectNode={onSelectNode}
        />
      </svg>
    );

    expect(container.textContent).toContain('⚡');
  });
});
