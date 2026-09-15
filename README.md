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
npm run lint     # oxlint
npm run build    # production bundle
```

Open the app, pick a sample query on the Dashboard (all samples are real,
verified mainnet transactions), or paste any transaction hash or address.

## What it does

- **Tracing** — forward outspend tracing with bounded parallelism, peel-chain
  priority, branch pruning, and CoinJoin halt.
- **Classification** — weighted change-vs-payment scoring (script match,
  address identity incl. bare public keys, roundness, dwell timing, fee
  context) with per-hop confidence.
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
