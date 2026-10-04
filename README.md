# AegisTrace — Bitcoin Forensics

AegisTrace traces Bitcoin money flows on the live mainnet (Blockstream +
Mempool.space gateways, with failover and cache) and turns them into
reviewable cases: fund-flow graphs, change-vs-payment classification, taint
maps, cluster analysis, risk scores, and printable reports.

## Quick start

```bash
npm install
npm run dev      # local dev server
npm test         # unit suite (vitest)
npm run verify   # labeled-set accuracy table (offline)
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
- **Evidence** — hash-chained chain-of-custody timelines, Section 67 notices,
  Section 65B certificates, and print-ready reports.
- **Cross-Chain Intelligence** — bridge memo extraction (THORChain, Maya Protocol,
  SideShift, ChangeNOW) identifying hop destinations to secondary networks
  (Ethereum, Tron, Solana).
- **Mathematical Invariants** — continuous value conservation checks, FIFO
  anti-minting audits, and multi-model taint spread verification.

## Layout

- `src/components/` — routes (Dashboard, Tracing, Notices, Clustering,
  Linked cases, Risk, Watchlist, Report) plus graph canvas/sidebar/timeline.
- `src/utils/` — chain API, heuristics, taint, clustering, risk, dossiers,
  custody, cross-chain bridge analysis, and narrative modules. Every module has colocated `.test.js`
  coverage (33 test files, 221 automated tests).
- `src/data/` — `judicialCorpus.js` (unsealed court docket ground truth: FBI/IRS-CI/BKA),
  `forensicCorpus.js` (reference list of known mainnet transaction IDs), and seed scenarios.
- `src/hooks/`, `src/context/`, `src/constants/` — shared state and config.

Live network calls happen only on explicit user actions (trace, expand,
fee compare, mempool scan, endpoint profiles); everything else runs locally.

## Measuring accuracy & test suite

Be precise about what the numbers mean:

- **Per-hop confidence** (0–1) measures how strongly the heuristics agree on
  one output — margin of the weighted score, decayed by trace depth, floored
  for near-deterministic identity calls. It is *not* a measured probability.
- **Trace confidence** averages per-hop confidence, discounted for ambiguous
  hops and chain length. A CoinJoin halt or a trace with no scored hops
  reports unknown instead of a default 50%.
- **Labeled-set accuracy** (`npm run verify`) is the actual measurement:
  ground-truth payment/change labels on real mainnet shapes (pizza purchase,
  first-ever transaction, ransom splits, self-consolidations, coinbase),
  scored by the same thresholds the product uses. Accuracy is reported over
  committed decisions only, alongside coverage, per-class precision/recall,
  and each verdict's margin past the decision boundary — thin margins flag
  where the next labeled case should go. The risk suite additionally checks
  that threat bands survive ±20% weight changes.
- **Test Suite Status**: 33 test files, 221 passing unit tests across all
  financial, graph, cryptographic, and algorithmic modules.

To demonstrate end to end: run `npm run verify` for the offline table, then
paste any mainnet txid or address on the Dashboard and trace it live.
Value-conservation warnings, taint continuity, and dwell consistency act as
independent cross-checks; the chain-of-custody ledger makes any post-hoc edit
of the trail mechanically detectable.

## System Improvement & Evolution Roadmap

A technical evaluation identified key strategic vectors for the project's evolution:

1. **Storage & Local Security (Priority 1)**:
   - Migrate persistence from `localStorage` (5MB ceiling) to **IndexedDB** to store 1,000+ deep graph nodes and historical traces safely.
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


