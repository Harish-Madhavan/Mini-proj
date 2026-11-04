/**
 * AegisTrace Syndicate Correlation Engine (Cross-Case Entity Resolution)
 *
 * Individual cases are investigative silos; syndicates are not. This module
 * compares on-chain evidence across cases — shared addresses and explicitly
 * recorded joint-input transactions. Neither relationship proves common
 * control or identity.
 *
 * Shared addresses are intersected pairwise; recorded joint-input transactions
 * link cases only when distinct validated input addresses map to each case.
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

  const pairHits = new Map();
  const getPair = (caseA, caseB) => {
    const [a, b] = [caseA, caseB].sort();
    const key = `${a}<>${b}`;
    if (!pairHits.has(key)) {
      pairHits.set(key, { caseA: a, caseB: b, shared: [], sharedTransactions: [], manualAssociations: [] });
    }
    return pairHits.get(key);
  };

  for (const [addr, holders] of index) {
    if (holders.length < 2) continue;
    for (let i = 0; i < holders.length; i++) {
      for (let j = i + 1; j < holders.length; j++) {
        const [a, b] = [holders[i], holders[j]].sort();
        dsu.union(a, b);
        getPair(a, b).shared.push({
          address: addr,
          rolesA: [...(footprints.get(a).get(addr)?.roles || [])],
          rolesB: [...(footprints.get(b).get(addr)?.roles || [])],
        });
      }
    }
  }

  const jointTxByCase = new Map(valid.map(caseData => {
    const evidenceByTxid = new Map();
    (Array.isArray(caseData.jointTransactionEvidence) ? caseData.jointTransactionEvidence : []).forEach(evidence => {
      if (!/^[0-9a-f]{64}$/i.test(evidence?.txid || '') || !Array.isArray(evidence.inputAddresses)) return;
      const caseAddressSet = footprints.get(caseData.id);
      const inputAddresses = [...new Set(evidence.inputAddresses.filter(address =>
        isJoinableAddress(address) && caseAddressSet.has(address)
      ))];
      if (inputAddresses.length) evidenceByTxid.set(evidence.txid.toLowerCase(), inputAddresses);
    });
    return [caseData.id, evidenceByTxid];
  }));
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const caseA = valid[i].id;
      const caseB = valid[j].id;
      const evidenceA = jointTxByCase.get(caseA);
      const evidenceB = jointTxByCase.get(caseB);
      for (const [txid, inputAddressesA] of evidenceA) {
        const inputAddressesB = evidenceB.get(txid);
        if (!inputAddressesB?.length) continue;
        const addressesA = inputAddressesA.filter(address => !inputAddressesB.includes(address));
        const addressesB = inputAddressesB.filter(address => !inputAddressesA.includes(address));
        if (!addressesA.length || !addressesB.length) continue;
        dsu.union(caseA, caseB);
        getPair(caseA, caseB).sharedTransactions.push({
          txid,
          inputAddressesA,
          inputAddressesB,
          method: 'common-input co-spend',
          warning: 'A shared transaction is a reviewable co-spend link only; it does not establish common ownership or control.',
        });
      }
    }
  }

  const manualAssociationsById = new Map();
  for (const caseData of valid) {
    const records = Array.isArray(caseData.manualCaseAssociations) ? caseData.manualCaseAssociations : [];
    for (const association of records) {
      if (typeof association?.associationId !== 'string' ||
          typeof association.caseAId !== 'string' ||
          typeof association.caseBId !== 'string' ||
          association.caseAId === association.caseBId ||
          !Array.isArray(association.transactionIds) ||
          !association.transactionIds.length ||
          association.transactionIds.some(txid => !/^[0-9a-f]{64}$/i.test(txid)) ||
          typeof association.rationale !== 'string' || !association.rationale.trim()) continue;
      const [caseAId, caseBId] = [association.caseAId, association.caseBId].sort();
      if (!valid.some(item => item.id === caseAId) || !valid.some(item => item.id === caseBId) ||
          (caseData.id !== caseAId && caseData.id !== caseBId)) continue;
      if (!manualAssociationsById.has(association.associationId)) {
        manualAssociationsById.set(association.associationId, {
          caseAId,
          caseBId,
          transactionIds: [...new Set(association.transactionIds.map(txid => txid.toLowerCase()))],
          rationale: association.rationale,
          warning: association.warning || 'Investigator-reported association; not independently verified.',
          caseIds: new Set(),
        });
      }
      const saved = manualAssociationsById.get(association.associationId);
      if (saved.caseAId === caseAId && saved.caseBId === caseBId &&
          saved.rationale === association.rationale) {
        saved.caseIds.add(caseData.id);
      }
    }
  }
  for (const association of manualAssociationsById.values()) {
    if (!association.caseIds.has(association.caseAId) || !association.caseIds.has(association.caseBId)) continue;
    dsu.union(association.caseAId, association.caseBId);
    getPair(association.caseAId, association.caseBId).manualAssociations.push(association);
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
      sharedTransactionCount: p.sharedTransactions.length,
      manualAssociationCount: p.manualAssociations.length,
      endpointShares,
      linkScore,
      verdict: p.manualAssociations.length > 0 && linkScore === 0 ? 'INVESTIGATOR_ASSOCIATED'
        : linkScore >= 55 ? 'SAME_OPERATOR_LIKELY'
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
