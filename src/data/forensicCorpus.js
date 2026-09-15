/**
 * AegisTrace Verified Forensic Test Corpus
 *
 * Every entry below is a REAL Bitcoin mainnet transaction/address, verified
 * live against Blockstream + Mempool.space gateways (shape, block height and
 * spend status confirmed on-chain — not taken on trust from literature).
 * Each exercises a distinct capability of the tracing system:
 *
 * - genesis coinbase  → coinbase-input handling, unspendable early-format output
 * - first-tx          → public-key identity (change reuse vs fresh payment) + dwell timing
 * - pizza purchase    → single-output identity (131 funder inputs, one fresh round output)
 * - pizza spend       → 1-in-2-out peel split with BOTH branches spent (follow-through)
 * - batch dispersal   → 1-in-57 fan-out, branching/prune logic, dispersal-vs-structuring
 * - donation address  → address-trace across a rich multi-year history
 */

export const FORENSIC_CORPUS = [
  {
    key: 'genesis',
    label: 'Genesis Coinbase',
    kind: 'tx',
    value: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
    typology: 'Block reward (no funder)',
    block: 0,
    tests: 'Block-reward input rendering, early-format output typing',
    expectation: 'Single block-reward input node; 50 BTC early-format output; no change/payment split inferred',
  },
  {
    key: 'first-tx',
    label: 'First Tx (Satoshi→Hal)',
    kind: 'tx',
    value: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
    typology: 'Early-format payment + change split',
    block: 170,
    tests: 'Public-key reuse (self) vs fresh payment, spend timing',
    expectation: '10 BTC fresh-key output → payment hop; 40 BTC reused-key output → change consolidation',
  },
  {
    key: 'pizza',
    label: 'Pizza Purchase (10k BTC)',
    kind: 'tx',
    value: 'a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d',
    typology: 'Single-output identity payment',
    block: 57043,
    tests: 'H8 identity rule (131 inputs, one fresh round output)',
    expectation: '10,000 BTC output → high-confidence payment hop, trail follows to block-57044 split',
  },
  {
    key: 'pizza-spend',
    label: 'Pizza Spend (peel split)',
    kind: 'tx',
    value: 'cca7507897abc89628f450e8b1e0c6fca4ec3f7b34cccf55f3f531c659ff4d79',
    typology: '1-in-2-out historic split',
    block: 57044,
    tests: 'Follow-through on all spent branches to terminal receivers',
    expectation: 'Both outputs (5,777 BTC + 4,223 BTC early-format) traced forward to their spends',
  },
  {
    key: 'batch',
    label: 'Batch Dispersal (1→57)',
    kind: 'tx',
    value: '4f11f4965a2e5a61407c4f9a68db803b8e8d5bb3ffb85f6de17a61159176d042',
    typology: 'Batch dispersal w/ equal band',
    block: 959467,
    tests: 'Branch pruning under fan-out, dispersal-vs-structuring (19x10 BTC above smurfing cap)',
    expectation: 'Pruning warning fires; 19x10 BTC band NOT flagged as smurfing; dust-fragment bands rejected by share gate',
  },
  {
    key: 'donations',
    label: 'Donation Address',
    kind: 'address',
    value: '1HB5XMLmzFVj8ALj6mfBsbifRoD4miY36v',
    typology: 'Rich multi-year history',
    block: null,
    tests: 'Address-trace path (latest-tx forward trace across mixed historic wallet activity)',
    expectation: 'Latest activity traced; batch spends and peel shapes resolve per-output',
  },
  {
    key: 'ransom-sweep',
    label: 'Ransom Sweep (76→1)',
    kind: 'tx',
    value: '35e5d5fe8c8128cfa6884f56be5817e4138c58c91b79d78d3e78a8d365b9d8a7',
    typology: 'Ransom aggregation sweep',
    block: 478796,
    tests: 'Single-output rule + sweep check (76 funder inputs, 9.03 BTC, urgent fee)',
    expectation: 'Sweep flagged (WATCH, non-custodial); output → payment hop; trail follows to peel split',
  },
  {
    key: 'peel-split',
    label: 'Ransom Peel Split',
    kind: 'tx',
    value: '2b22df65026d8384e01e0deb9b115ba9725bbe9d95c4f61d18dee6e40fa47b74',
    typology: 'Extreme-ratio split (0.04% / 99.96%)',
    block: 478829,
    tests: 'Dominant-remainder change rule + dwell timing (change swept in 8 blocks, payout dwelled 4,001)',
    expectation: '9.02 BTC output → change step; 329k-sat payout → transit; both branches followed',
  },
  {
    key: 'sweep-split',
    label: 'Companion Sweep-Split',
    kind: 'tx',
    value: '409803bb5e124fd028c0482027c7722e84ce55b78204b279d3a44aba5e7c1698',
    typology: '36-in-2-out ransom split',
    block: 478795,
    tests: 'Gather-then-split in one transaction (8.73 BTC in, 1.23M-sat payout + 8.72 BTC remainder)',
    expectation: 'Remainder → change step via dominant-share rule; payout resolved independently',
  },
];

export function getCorpusEntry(key) {
  return FORENSIC_CORPUS.find(e => e.key === key) || null;
}
