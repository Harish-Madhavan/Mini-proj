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

Open the app, pick a sample query on the Dashboard (all samples are real,
verified mainnet transactions), or paste any transaction hash or address.

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

## Layout

- `src/components/` — routes (Dashboard, Tracing, Notices, Clustering,
  Linked cases, Risk, Watchlist, Report) plus graph canvas/sidebar/timeline.
- `src/utils/` — chain API, heuristics, taint, clustering, risk, dossiers,
  custody, and narrative modules. Every module has colocated `.test.js`
  coverage.
- `src/data/forensicCorpus.js` — verified mainnet transactions backing the
  Dashboard samples and regression fixtures.
- `src/hooks/`, `src/context/`, `src/constants/` — shared state and config.

Live network calls happen only on explicit user actions (trace, expand,
fee compare, mempool scan, endpoint profiles); everything else runs locally.

## Measuring accuracy

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

To demonstrate end to end: run `npm run verify` for the offline table, then
trace the Dashboard corpus samples live and compare each hop against the
expected outcome in `src/data/forensicCorpus.js`. Value-conservation
warnings, taint continuity, and dwell consistency act as independent
cross-checks; the chain-of-custody ledger makes any post-hoc edit of the
trail mechanically detectable.
