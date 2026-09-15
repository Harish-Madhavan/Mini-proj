/**
 * AegisTrace Syndicate Correlation Engine (Cross-Case Entity Resolution)
 *
 * Individual cases are investigative silos; syndicates are not. This module
 * resolves shared on-chain infrastructure ACROSS cases — a reused peel hop,
 * a common consolidation wallet, or the same exchange deposit point appearing
 * in two cases is evidence of one operator behind both.
 *
 * Method: extract verifiable payment addresses per case, intersect pairwise,
 * and link cases into syndicate components (Union-Find over shared addresses).
 * Tx-hub ids, OP_RETURN payloads, pseudo-addresses (P2PK/multisig/script
 * placeholders) and unparseable labels are never used as join keys — only
 * strings that pass Bitcoin address validation.
 */

import { DisjointSetUnion } from './clusteringAlgorithms';
import { validateBtcAddress } from './forensicUtils';

const PSEUDO_PREFIXES = ['1_P2PK_', 'multisig_', 'script_', 'out_script_', 'OP_RETURN', 'Coinbase'];

/** True only for strings usable as cross-case join keys. */
export function isJoinableAddress(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (PSEUDO_PREFIXES.some(p => trimmed.startsWith(p))) return false;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return false; // txids, not identities
  if (/^(tx_|in_|out_|op_)/.test(trimmed)) return false; // internal node ids
  return validateBtcAddress(trimmed).isValid;
}

/**
 * Extract the verifiable address footprint of one case.
 * @returns {Map<string, { nodeIds: string[], roles: Set<string> }>}
 */
export function extractCaseAddresses(caseObj) {
  const footprint = new Map();
  const nodes = caseObj?.nodes || [];
  for (const n of nodes) {
    const addr = n.details?.address;
    if (!isJoinableAddress(addr)) continue;
    const key = addr.trim();
    if (!footprint.has(key)) footprint.set(key, { nodeIds: [], roles: new Set() });
    const entry = footprint.get(key);
    entry.nodeIds.push(n.id);
    entry.roles.add(n.type || 'unknown');
  }
  return footprint;
}

/**
 * Correlate a set of cases through shared addresses.
 * @param {Array<Object>} cases - case objects with { id, nodes }
 * @returns {{ pairs: Array, components: Array, caseCount: number, linkedCaseCount: number }}
 */
export function correlateCases(cases = []) {
  const valid = (cases || []).filter(c => c && c.id);
  const footprints = new Map();
  valid.forEach(c => footprints.set(c.id, extractCaseAddresses(c)));

  const dsu = new DisjointSetUnion();
  valid.forEach(c => dsu.makeSet(c.id));

  // Inverted index: address -> case ids holding it
  const index = new Map();
  for (const [caseId, fp] of footprints) {
    for (const addr of fp.keys()) {
      if (!index.has(addr)) index.set(addr, []);
      index.get(addr).push(caseId);
    }
  }

  const pairHits = new Map(); // "a<>b" -> { shared: [{address, rolesA, rolesB}] }
  for (const [addr, holders] of index) {
    if (holders.length < 2) continue;
    for (let i = 0; i < holders.length; i++) {
      for (let j = i + 1; j < holders.length; j++) {
        const [a, b] = [holders[i], holders[j]].sort();
        dsu.union(a, b);
        const key = `${a}<>${b}`;
        if (!pairHits.has(key)) pairHits.set(key, { caseA: a, caseB: b, shared: [] });
        pairHits.get(key).shared.push({
          address: addr,
          rolesA: [...(footprints.get(a).get(addr)?.roles || [])],
          rolesB: [...(footprints.get(b).get(addr)?.roles || [])],
        });
      }
    }
  }

  const pairs = [...pairHits.values()].map(p => {
    // A shared ENDPOINT (receiver/exchange deposit) is stronger evidence of a
    // common cash-out controller than a shared transit hop.
    const endpointShares = p.shared.filter(s =>
      s.rolesA.includes('receiver') || s.rolesB.includes('receiver')).length;
    const linkScore = Math.min(99, p.shared.length * 20 + endpointShares * 15);
    return {
      ...p,
      sharedCount: p.shared.length,
      endpointShares,
      linkScore,
      verdict: linkScore >= 55 ? 'SAME_OPERATOR_LIKELY'
        : linkScore >= 35 ? 'SHARED_INFRASTRUCTURE' : 'WEAK_OVERLAP',
    };
  }).sort((a, b) => b.linkScore - a.linkScore);

  // Sort for determinism: component numbering must not depend on DSU
  // insertion order, or SYN-01 would point at different cases per render.
  const components = dsu.getClusters()
    .filter(cluster => cluster.length > 1)
    .map(cluster => [...cluster].sort())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map((caseIds, i) => ({
      syndicateId: `SYN-${String(i + 1).padStart(2, '0')}`,
      caseIds,
    }));

  const linked = new Set();
  pairs.forEach(p => { linked.add(p.caseA); linked.add(p.caseB); });

  return {
    pairs,
    components,
    caseCount: valid.length,
    linkedCaseCount: linked.size,
  };
}
