import { describe, it, expect } from 'vitest';
import { 
  computeLayeredGraphLayout, 
  findCriticalMoneyTrail, 
  detectCircularFlows, 
  computeNodeCentralityMetrics,
  getCollapsibleInputClusters,
  collapseGraphClusters
} from './graphAlgorithms';

describe('graphAlgorithms', () => {
  const sampleNodes = [
    { id: 'suspect_1', type: 'suspect', label: 'Suspect Origin' },
    { id: 'tx_hub_1', type: 'hop', label: 'Tx Hub' },
    { id: 'hop_1', type: 'hop', label: 'Transit Hop' },
    { id: 'receiver_1', type: 'receiver', label: 'End Receiver' }
  ];

  const sampleLinks = [
    { source: 'suspect_1', target: 'tx_hub_1', value: '10.0 BTC' },
    { source: 'tx_hub_1', target: 'hop_1', value: '7.5 BTC' },
    { source: 'hop_1', target: 'receiver_1', value: '7.2 BTC' }
  ];

  describe('computeLayeredGraphLayout', () => {
    it('generates non-overlapping coordinates in left-to-right topological order', () => {
      const positions = computeLayeredGraphLayout(sampleNodes, sampleLinks, { width: 800, height: 360 });

      expect(positions['suspect_1']).toBeDefined();
      expect(positions['receiver_1']).toBeDefined();

      // Suspect should be on left (smaller X), Receiver on right (larger X)
      expect(positions['suspect_1'].x).toBeLessThan(positions['receiver_1'].x);
      expect(positions['tx_hub_1'].x).toBeLessThan(positions['receiver_1'].x);
    });
  });

  describe('findCriticalMoneyTrail', () => {
    it('finds the maximum-value traversal path connecting source to receiver', () => {
      const result = findCriticalMoneyTrail(sampleNodes, sampleLinks, 'suspect_1', 'receiver_1');

      expect(result.path).toEqual(['suspect_1', 'tx_hub_1', 'hop_1', 'receiver_1']);
      expect(result.totalValue).toBeGreaterThan(20);
      expect(result.linkIndices.length).toBe(3);
    });

    it('selects reachable receiver even if an unreachable node has higher inflow', () => {
      const disconnectedNodes = [
        ...sampleNodes,
        { id: 'unreachable_big', type: 'receiver', label: 'Unreachable' }
      ];
      const disconnectedLinks = [
        ...sampleLinks,
        { source: 'external_source', target: 'unreachable_big', value: '100.0 BTC' }
      ];
      const result = findCriticalMoneyTrail(disconnectedNodes, disconnectedLinks, 'suspect_1');
      expect(result.path).toEqual(['suspect_1', 'tx_hub_1', 'hop_1', 'receiver_1']);
    });
  });

  describe('detectCircularFlows', () => {
    it('detects fund cycling and smurfing loops', () => {
      const cycleNodes = [
        { id: 'A' }, { id: 'B' }, { id: 'C' }
      ];
      const cycleLinks = [
        { source: 'A', target: 'B', value: '5 BTC' },
        { source: 'B', target: 'C', value: '4.8 BTC' },
        { source: 'C', target: 'A', value: '4.5 BTC' } // Loop back to A
      ];

      const cycles = detectCircularFlows(cycleNodes, cycleLinks);
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain('A');
      expect(cycles[0]).toContain('B');
      expect(cycles[0]).toContain('C');
    });

    it('returns empty array when graph has no cycles', () => {
      const acyclicLinks = [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' }
      ];
      const cycles = detectCircularFlows([{ id: 'A' }, { id: 'B' }, { id: 'C' }], acyclicLinks);
      expect(cycles.length).toBe(0);
    });
  });

  describe('computeNodeCentralityMetrics', () => {
    it('computes throughput and identifies transit hub nodes', () => {
      const metrics = computeNodeCentralityMetrics(sampleNodes, sampleLinks);

      expect(metrics['suspect_1'].outDegree).toBe(1);
      expect(metrics['suspect_1'].inDegree).toBe(0);
      expect(metrics['tx_hub_1'].totalDegree).toBe(2);
      expect(metrics['receiver_1'].inDegree).toBe(1);
    });
  });

  describe('Cluster Node Collapsing', () => {
    it('identifies and collapses multi-input fan-in clusters into a single entity badge', () => {
      const nodes = [
        { id: 'in_1', type: 'hop', balance: '1.0 BTC' },
        { id: 'in_2', type: 'hop', balance: '2.0 BTC' },
        { id: 'in_3', type: 'hop', balance: '3.0 BTC' },
        { id: 'in_4', type: 'hop', balance: '4.0 BTC' },
        { id: 'tx_consolidation', type: 'tx', label: 'Sweep Tx' },
        { id: 'out_receiver', type: 'receiver', balance: '9.99 BTC' }
      ];
      const links = [
        { source: 'in_1', target: 'tx_consolidation', value: '1.0 BTC' },
        { source: 'in_2', target: 'tx_consolidation', value: '2.0 BTC' },
        { source: 'in_3', target: 'tx_consolidation', value: '3.0 BTC' },
        { source: 'in_4', target: 'tx_consolidation', value: '4.0 BTC' },
        { source: 'tx_consolidation', target: 'out_receiver', value: '9.99 BTC' }
      ];

      const clusters = getCollapsibleInputClusters(nodes, links, 3);
      expect(clusters.has('tx_consolidation')).toBe(true);
      expect(clusters.get('tx_consolidation').inputCount).toBe(4);
      expect(clusters.get('tx_consolidation').totalBtc).toBe(10);

      const collapsed = collapseGraphClusters(nodes, links, { minClusterSize: 3 });
      expect(collapsed.isCollapsed).toBe(true);

      // The 4 input nodes are replaced by 1 cluster node
      const clusterNode = collapsed.nodes.find(n => n.id === 'cluster_tx_consolidation');
      expect(clusterNode).toBeDefined();
      expect(clusterNode.type).toBe('cluster');
      expect(clusterNode.subNodeIds.length).toBe(4);
      expect(clusterNode.balance).toBe('10 BTC');

      // The 4 links into the tx are replaced by 1 link from the cluster node
      const clusterLink = collapsed.links.find(l => l.source === 'cluster_tx_consolidation');
      expect(clusterLink).toBeDefined();
      expect(clusterLink.target).toBe('tx_consolidation');
      expect(clusterLink.value).toBe('10 BTC');

      // Total nodes reduced from 6 to 3 (cluster, tx, receiver)
      expect(collapsed.nodes.length).toBe(3);
    });
  });
});
