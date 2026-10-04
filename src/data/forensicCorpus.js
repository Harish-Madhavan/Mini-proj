/**
 * AegisTrace Forensic Reference List — KNOWN TRANSACTION IDS (REFERENCE ONLY)
 *
 * This file is the investigator's personal reference notebook: real Bitcoin
 * mainnet transaction/address identifiers once verified live against
 * Blockstream + Mempool.space gateways. Nothing in the application reads
 * this file at runtime — no Dashboard samples, no tracing shortcuts, no
 * scoring hints. Every trace is computed live from gateway data for
 * whatever identifier the investigator pastes in. Only
 * src/utils/forensicCorpus.test.js imports this file, solely to check the
 * reference list itself is well-formed.
 *
 * Shape key:
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
    tests: 'Address-trace path (most-significant recent movement traced; dust pages skipped)',
    expectation: 'Largest significant movement traced; batch spends and peel shapes resolve per-output',
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
  {
    key: 'bitfinex-gov-seizure',
    label: 'Bitfinex Seizure Wallet (DOJ 2022)',
    kind: 'address',
    value: 'bc1qazcm763858nkj2dj986etajv6wquslv8uxwczt',
    typology: 'Government consolidation wallet (183 funding txs, ~94,643 BTC, 0 spends)',
    block: 721292,
    tests: 'Reference: heavy fan-in seizure sink; cross-check aggregator profiling',
    expectation: 'Reference only — trace live; expect unspent aggregator holding ~94,643.48 BTC',
  },
  {
    key: 'bitfinex-sweep-592',
    label: 'Bitfinex Sweep (592→2, 10k BTC)',
    kind: 'tx',
    value: 'e6088723889de70fa985e7b8c012c77ea693a6ef9379fb26a951a2bb5c722525',
    typology: 'Heavy multi-input consolidation (592 inputs, 10,000 BTC + 4.52 BTC outputs)',
    block: 721292,
    tests: 'Reference: heavy multi-input capacity probe for live tracing',
    expectation: 'Reference only — trace live; expect dominant-2-out sweep and a followed 4.52 BTC branch',
  },
  {
    key: 'silkroad-gov-seizure',
    label: 'Silk Road Seizure Wallet (FBI 2020)',
    kind: 'address',
    value: 'bc1qa5wkgaew2dkv56kfvj49j0av5nml45x9ek9hz6',
    typology: 'Government consolidation wallet (189 funding txs, ~69,370.18 BTC, 0 spends)',
    block: 655283,
    tests: 'Reference: unspent government sink for live-trace comparison',
    expectation: 'Reference only — trace live; expect unspent aggregator holding ~69,370.18 BTC',
  },
  {
    key: 'silkroad-seizure-move',
    label: 'Silk Road Seizure Move (69,369 BTC)',
    kind: 'tx',
    value: '3f036ff88bb851b57a1e28780dbce35a6457a8b57995c095b55b3b0cf48ba9fd',
    typology: 'Single-output identity seizure (1-in-1-out, 69,369.16 BTC, 1HQ3→FBI)',
    block: 655283,
    tests: 'Reference: single-output identity probe for live tracing',
    expectation: 'Reference only — trace live; expect high-confidence payment hop, no change split',
  },
  {
    key: 'silkroad-hacker-cluster',
    label: 'Silk Road Hacker Cluster (1HQ3)',
    kind: 'address',
    value: '1HQ3Go3ggs8pFnXuHVHRytPCq5fGG8Hbhx',
    typology: 'Hacker consolidation wallet (274 txs, ~208,210 BTC lifetime in, converges 1BAD+1BBq)',
    block: 655283,
    tests: 'Reference: dust-heavy address for significant-movement picker checks',
    expectation: 'Reference only — trace live; newest pages are dust, significance lies deeper',
  },
];

export function getCorpusEntry(key) {
  return FORENSIC_CORPUS.find(e => e.key === key) || null;
}
