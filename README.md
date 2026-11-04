# AegisTrace — Bitcoin Forensics

AegisTrace traces Bitcoin money flows on the live mainnet (Blockstream +
Mempool.space gateways, with failover and cache) and turns them into
reviewable cases: fund-flow graphs, change-vs-payment classification, taint
maps, cluster analysis, risk scores, and printable reports.

The project is developed in response to the SIH-1675 problem statement for
Bitcoin tracing and forensic investigation.

## Quick start

```bash
npm install
npm run dev      # local dev server
npm test         # unit suite (vitest)
npm run verify   # offline heuristic-fixture regression table
npm run verify:ground-truth # source/provenance checks and reviewed-case evaluator tests
npm run lint     # oxlint
npm run build    # production bundle
```

Open the app and paste any mainnet transaction hash or address — every
trace is computed live from gateway data.

## What it does

- **Tracing** — forward outspend tracing with bounded parallelism, peel-chain
  priority (high-confidence change runs up to 2 levels past max depth),
  branch pruning, and CoinJoin halt.
- **Classification** — weighted change-vs-payment scoring (script match,
  address identity incl. bare public keys, roundness, dwell timing, fee
  context, plus live chain-reuse checks on ambiguous outputs) with per-hop
  confidence.
- **Taint** — haircut, FIFO, and poison models with edge maps and an audit
  ledger, rendered as a graph heatmap.
- **Clustering** — co-spending groups, peel detection, fee-habit comparison,
  and received-funds accounting from fetched histories.
- **Typologies** — batch structuring, consolidation sweeps, bridge/swap
  routers, and cross-case address correlation.
- **Evidence workflow** — case timelines, notice/report templates, reviewable
  evidence claims, and a SHA-256 digest of the report payload. These are
  investigative aids, not a legal-admissibility or identity-verification guarantee.
- **Cross-Chain Intelligence** — bridge memo extraction proposes destination
  details from memo text. It does not verify settlement or trace transactions on
  the destination network.
- **Mathematical Invariants** — continuous value conservation checks, FIFO
  anti-minting audits, and multi-model taint spread verification.

## Layout

- `src/components/` — routes (Dashboard, Tracing, Notices, Clustering,
  Linked cases, Risk, Watchlist, Report) plus graph canvas/sidebar/timeline.
- `src/utils/` — chain API, heuristics, taint, clustering, risk, dossiers,
  custody, cross-chain bridge analysis, and narrative modules. Every module has colocated `.test.js`
  tests. Run `npm test` for current totals.
- `src/data/` — `judicialCorpus.js` separates public-case/source leads and
  unverified trace references from the verified benchmark; `forensicCorpus.js`
  contains candidate identifiers, not ground truth, alongside seed scenarios.
- `src/hooks/`, `src/context/`, `src/constants/` — shared state and config.

Live network calls happen only on explicit user actions (trace, expand,
fee compare, mempool scan, endpoint profiles). Case data is stored in browser
`localStorage` without at-rest encryption. Live lookups send the requested
transaction IDs or addresses to Blockstream or Mempool.space, so this is not
an air-gapped or query-private deployment.

## Measuring accuracy & test suite

Be precise about what the numbers mean:

- **Per-hop confidence** (0–1) measures how strongly the heuristics agree on
  one output — margin of the weighted score, decayed by trace depth. It is
  *not* a measured probability; a fresh output address does not prove external ownership.
- **Trace confidence** averages per-hop confidence, discounted for ambiguous
  hops and chain length. A CoinJoin halt or a trace with no scored hops
  reports unknown instead of a default 50%.
- **Offline heuristic fixtures** (`npm run verify`) are in-code regression
  examples, not an independently verified or held-out ground-truth benchmark.
  Their agreement and coverage do not estimate real-world accuracy.
- **Ground-truth benchmark** (`npm run verify:ground-truth`) keeps source leads
  and candidate transaction references out of scoring. A benchmark entry must
  include cited label sources with exact locations, reviewed transaction
  output indexes/addresses/roles, canonical on-chain response digests, and a
  recorded review method. Source tier is explicit: the current first
  person-to-person transaction case is source-corroborated by Bitcoin.com and
  its transaction outputs are independently checked against Blockstream.
  It reports exact-output and payment/change agreement, not independently
  established legal identity. `JUDICIAL_GROUND_TRUTH` remains empty until
  court-backed labels meet a separate evidence standard.
- `npm run verify:ground-truth` tests the evaluator and a regression fixture
  based on that one historical transaction; this small, curated case does not
  estimate accuracy on new transactions or establish generalization.
- Historical cases can support regression and confidence assessment, but do
  not prove performance on unseen transactions; that requires held-out,
  representative cases and explicit coverage/error analysis.
- **Test Suite Status**: Run `npm test` for the current result.

To demonstrate end to end: run `npm run verify` for the offline table, then
paste any mainnet txid or address on the Dashboard and trace it live.
Value-conservation warnings, taint continuity, and dwell consistency are
internal consistency checks, not independent confirmation of attribution or
path completeness. Cases produced from offline estimates and manually supplied
hypotheses are explicitly non-evidentiary and receive no numeric risk score.
The custody ledger now uses a SHA-256 event chain, but it is not signed or
externally anchored and is not a trusted evidentiary seal. The report SHA-256
digest detects changes to its canonical payload but does not authenticate its
source or prove legal admissibility.

## System Improvement & Evolution Roadmap

A technical evaluation identified key strategic vectors for the project's evolution:

1. **Storage & Local Security (Priority 1)**:
   - Migrate persistence from browser-managed `localStorage` to **IndexedDB** for larger case graphs, and handle storage failures explicitly.
   - Implement **AES-GCM-256** local at-rest vault encryption using PBKDF2 WebCrypto keys for sensitive case notes and suspect PII.
   - Add custom private node RPC endpoint configuration in `config.js` for air-gapped forensic laboratories.

2. **Evidentiary Rigor & Interoperability (Priority 2)**:
   - Implement native WebCrypto **ECDSA / Ed25519** asymmetric digital signature generation for Section 65B certificates.
   - Add export plugins for industry-standard formats: **STIX 2.1** (threat intel sharing) and **Neo4j Cypher** (graph database integration).
   - Incorporate **OpenTimestamps (OTS)** proof generation to anchor case integrity digests immutably into the Bitcoin blockchain.

3. **Graph Ergonomics & Visualization (Priority 3 - Completed)**:
   - **Cluster Node Collapsing**: Interactive graph grouping that automatically condenses multi-input fan-ins (CIOH co-spending) into single consolidated badges with total BTC volume and address count. Includes one-click toolbar toggle, uncollapse controls, and sub-node trace forward actions.
   - **Mempool WebSocket Feed**: Real-time bidirectional WebSocket client (`wss://mempool.space/api/v1/ws`) with automatic reconnect and live 0-confirmation surveillance alerts for watched wallets.
   - **Batch CSV Address Importer**: Modal tray that ingests CSV dumps of seized device addresses, validates formats, maps risk tiers and tags, and batch-populates surveillance watchlists or auto-generates consolidated investigation cases.

4. **Advanced Forensics & Real-Time Monitoring (Priority 4 - Completed)**:
   - **Subset-Sum Knapsack CoinJoin Solver**: Exponential-search partition solver with fee tolerance that unmixes ambiguous transactions and flags exact 1-to-1 or multi-input sub-clusters.
   - **Lightning Network & Submarine Swap HTLC Forensics**: Script classifier that inspects witness programs and redeem scripts to identify 2-of-2 funding channels, Boltz/Loop submarine swap HTLCs (hashlocks + timelocks), and Layer-2 off-ramp evasions.
   - **Multi-Chain Bridge Expansion**: Multi-network address validator (EVM `0x...`, TRON `T...`, Solana) and stablecoin contract inspector tracking ERC-20 and TRC-20 USDT token contracts (`0xdac17f...`, `TR7NHq...`) with direct block explorer cross-chain deep links.
