---
marp: true
theme: default
paginate: true
header: "AegisTrace — Bitcoin Blockchain Forensics Suite"
footer: "AegisTrace | SIH Problem Solution"
backgroundColor: "#0d1117"
color: "#e6edf3"
style: |
  section {
    font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
    padding: 40px;
    background-color: #0b0f19;
    color: #e2e8f0;
  }
  h1, h2, h3 {
    color: #38bdf8;
    font-weight: 700;
  }
  h1 { font-size: 2.2rem; margin-bottom: 0.5rem; }
  h2 { font-size: 1.6rem; border-bottom: 2px solid #1e293b; padding-bottom: 8px; }
  h3 { font-size: 1.2rem; color: #94a3b8; }
  code {
    font-family: 'JetBrains Mono', monospace;
    background: #1e293b;
    color: #38bdf8;
    padding: 2px 6px;
    border-radius: 4px;
  }
  blockquote {
    border-left: 4px solid #38bdf8;
    padding-left: 1rem;
    color: #94a3b8;
    background: #0f172a;
    border-radius: 0 8px 8px 0;
  }
  table {
    font-size: 0.85rem;
    width: 100%;
    border-collapse: collapse;
  }
  th {
    background: #1e293b;
    color: #38bdf8;
    padding: 8px;
    text-align: left;
  }
  td {
    border-bottom: 1px solid #1e293b;
    padding: 6px 8px;
  }
  .highlight {
    color: #f59e0b;
    font-weight: bold;
  }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .badge-blue { background: #0369a1; color: #e0f2fe; }
  .badge-amber { background: #b45309; color: #fef3c7; }
  .badge-green { background: #047857; color: #d1fae5; }
  .badge-red { background: #b91c1c; color: #fee2e2; }
---

<!-- 
===================================================================
SLIDE 1: TITLE SLIDE
Duration: 1.0 min
=================================================================== 
-->

# 🛡️ AegisTrace
### Next-Gen Client-Side Cryptocurrency Forensics & Intelligence Workstation

**Domain:** Narcotics Control Bureau (NCB) / Law Enforcement Blockchain Forensics  
**Standard / Reference:** SIH-1675  
**Core Mission:** De-anonymizing Illicit Bitcoin Flows, Layering Schemes, & Generating Court-Admissible Evidence  

---

| Spec | Description |
|---|---|
| **Engine Architecture** | Pure Client-Side Zero-Trust React 19 + Dual-Gateway Live Mainnet Tracing |
| **Analysis Suite** | 8-Factor Heuristics • Triple Taint Engine • DSU Clustering • 5D Risk Radar |
| **Evidence Workflow** | Draft worksheets and review aids; not statutory notices or certified evidence |

> 🎙️ **Speaker Notes (Opening Pitch):**  
> *"AegisTrace is a Bitcoin tracing and case review solution developed for the SIH problem statement. It queries public blockchain data providers on user actions, records case data in the browser, and offers analytical leads with their assumptions and limitations visible. Its reports and legal worksheets are drafts for independent review; the application does not issue legal notices or certify evidence."*

---

<!-- 
===================================================================
SLIDE 2: THE PROBLEM STATEMENT
Duration: 1.5 mins
=================================================================== 
-->

## 🚨 The Threat: Darknet Narcotics & Crypto Obfuscation

The proliferation of darknet markets has decoupled narcotics delivery from physical cash transactions.

### How Syndicates Exploit Blockchain Anonymity:
* **Layering & Peel Chains**: Splitting large proceeds into rapid, automated chains of hundreds of micro-transactions to wear down manual human tracking.
* **Structuring & Smurfing**: Dividing bulk payments under statutory reporting thresholds (PMLA / AML limits) across multiple addresses.
* **Anonymization Infrastructure**: Exploiting CoinJoin mixers (Wasabi, Whirlpool), non-KYC instant swappers, and cross-chain bridges to break transaction lineage.
* **Exchange Choke Points**: Funneling funds through unverified intermediary deposit addresses before liquidating into fiat currencies.

> ⚠️ **The Investigation Crisis**: Law enforcement officers face thousands of raw hex hashes without real-time heuristics, unable to distinguish between change addresses and actual merchant payments in court.

---

> 🎙️ **Speaker Notes:**  
> *"To understand why AegisTrace is essential, consider how modern drug syndicates operate. When illicit narcotics are sold on darknet platforms, proceeds are paid in Bitcoin. The vendor doesn't just withdraw to a bank. They initiate a 'peel chain' — peeling off small chunks while sending the remainder to new change addresses. Within 10 hops, an investigator is looking at 1,024 branching outputs. Without automated change detection and taint tracking, identifying the actual cash-out deposit point is like finding a needle in a haystack."*

---

<!-- 
===================================================================
SLIDE 3: CURRENT GAPS VS AEGIS-TRACE
Duration: 1.5 mins
=================================================================== 
-->

## 🔍 Industry Gap Analysis: Why Existing Tools Fall Short

| Metric / Dimension | Enterprise SaaS (Chainalysis / Elliptic) | Generic Block Explorers | **AegisTrace Workstation** |
|---|---|---|---|
| **Cost & Accessibility** | Prohibitive licenses ($50k+/yr) | Free / Basic | **Open, accessible, self-hostable** |
| **Verifiable Methodology** | Proprietary "black-box" scoring | No heuristic intelligence | **Mathematically verifiable math & code** |
| **Data Privacy & Operational Security**| Investigated addresses leak to US clouds | Public web queries leak IP/queries | **100% Client-side; zero external telemetry** |
| **Legal Integration** | Generic PDF export | No legal artifacts | **Reviewable draft worksheets; no statutory form or certificate issued** |
| **Taint Modeling** | Rigid single-model taint | None | **Tri-Model (FIFO, Haircut, Poison)** |
| **Mempool & 0-Conf** | Delayed block sync | Varies | **Live 0-Conf mempool leak monitor** |

> 🎯 **Key Innovation:** AegisTrace combines high-end forensic heuristics with statutory compliance for Indian jurisprudence, running entirely in the browser.

---

> 🎙️ **Speaker Notes:**  
> *"Why can't our enforcement agencies simply use existing tools? First, cost: commercial tools cost tens of thousands of dollars per seat, locking out state police and field units. Second, OPSEC: querying suspect addresses on third-party SaaS servers alerts the platform and creates jurisdiction leaks. Third, court admissibility: defense lawyers challenge black-box scores. AegisTrace solves all three: it runs zero-backend in the investigator's local browser, explains every single heuristic calculation with mathematical clarity, and signs evidence with SHA-256 custody chains."*

---

<!-- 
===================================================================
SLIDE 4: SYSTEM ARCHITECTURE & RESILIENT NETWORK LAYER
Duration: 2.0 mins
=================================================================== 
-->

## 🏛️ System Architecture: Resilient Dual-Gateway Design

```
+-----------------------------------------------------------------------------------+
|                           PRESENTATION LAYER (React 19)                           |
|  Dashboard  |  Graph Explorer  |  Cluster Engine  |  Risk Radar  |  Legal Dossier |
+-----------------------------------------+-----------------------------------------+
                                          | Local State & Dispatcher
                                          v
+-----------------------------------------------------------------------------------+
|                        ALGORITHMIC FORENSICS ENGINE CORE                          |
|  * 8-Factor Classifier   * Tri-Model Taint Engine   * DSU Common Input Clusterer  |
|  * Obfuscation Detect    * Multi-Dim Risk Engine    * Hash-Chained Custody Ledger |
+-----------------------------------------+-----------------------------------------+
                                          | Bounded Concurrency + LRU Cache
                                          v
+-----------------------------------------------------------------------------------+
|                    RESILIENT DUAL-GATEWAY BLOCKCHAIN LAYER                        |
|   Primary: Blockstream Esplora REST API   <--->   Fallback: Mempool.space REST    |
|               [Auto-Failover on HTTP 429/504 | 5-Min Cache | Rate Limiting]       |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
                         LIVE BITCOIN MAINNET (19.8M+ BTC)
```

---

> 🎙️ **Speaker Notes:**  
> *"Here is our high-level architecture. At the base is our Resilient Dual-Gateway blockchain layer. Blockchain public endpoints can experience rate-limits or DDoS. AegisTrace implements an intelligent dual-gateway router between Blockstream Esplora and Mempool.space with automatic failover on HTTP 429 or timeout, in-memory LRU caching, and bounded request parallelism. Above this sits the Algorithmic Engine: pure deterministic JavaScript modules for heuristics, clustering, taint, and custody. Finally, the React 19 UI renders interactive pan-and-zoom SVG DAG graphs, risk radars, and printable court reports."*

---

<!-- 
===================================================================
SLIDE 5: FEATURE 1 — RECURSIVE TRACING & 8-FACTOR CLASSIFIER
Duration: 2.0 mins
=================================================================== 
-->

## 🔬 Core Engine 1: Forward Tracing & 8-Factor Change Classifier

When Bitcoin is spent, UTXOs split into payment outputs and change returns. Misidentifying change breaks the entire forensic trail.

### AegisTrace 8-Factor Change Weighting Matrix:
1. **Script Type Matching (Score: +35)**: If inputs use Native SegWit (`bc1q`) and Output A uses `bc1q` while Output B uses legacy `1...`, Output A is mathematically favored as the change output.
2. **Address Reuse Penalty (Score: -40)**: Standard wallets avoid address reuse for change; reused addresses are flagged as recipient wallets or services.
3. **Round Value Heuristic (Score: +25)**: Humans pay in round denominations (e.g., `0.50000000 BTC`, `1.00000000 BTC`). The odd remainder (`0.34182912 BTC`) is designated change.
4. **Peeling Chain Geometry (Score: +30)**: Detects classical asymmetrical output splits (1 small recipient, 1 large rollover).
5. **Dwell Time & Coin Age**: Evaluates UTXO holding time between hops.
6. **Dust & Threshold Analysis**: Flags unspendable dust and micro-structuring.
7. **Client LockTime / RBF Fingerprint**: Matches nLockTime and sequence signaling.
8. **Output Position Matching**: Bypasses pseudo-random BIP69 output ordering.

> 📊 **Result:** Each scored edge displays a heuristic change-likelihood score and rationale. The score is not a calibrated probability or proof of payment/change ownership.

---

> 🎙️ **Speaker Notes:**  
> *"The biggest challenge in Bitcoin tracing is change address classification. Bitcoin's UTXO model is like breaking a 100-rupee note to buy a 20-rupee item — you get an 80-rupee note back as change. If an investigator follows the 80-rupee change note thinking it's the payment, they trace the merchant instead of the criminal, or vice-versa. AegisTrace implements an 8-factor change classification matrix evaluating script matching, address reuse, round number bias, and peeling chain asymmetry to assign a transparent confidence percentage to every hop."*

---

<!-- 
===================================================================
SLIDE 6: FEATURE 2 — TRIPLE-MODEL TAINT PROPAGATION
Duration: 2.0 mins
=================================================================== 
-->

## 🧪 Core Engine 2: Verifiable Multi-Model Taint Analysis

When criminal funds mix with legitimate coins, how far does the guilt travel? Courts demand strict mathematical justification.

```
       [Source: Drug Sale] 2.0 BTC (100% Tainted)
                  \
                   v
           [Transaction Hop 1] (Inputs: 2.0 BTC illicit + 2.0 BTC clean)
                 /             \
                v               v
       [Output A: 1.0 BTC]    [Output B: 3.0 BTC]
```

### AegisTrace Computes All 3 Recognized Forensic Standards:

| Model | Output A Taint | Output B Taint | Forensic Justification / Legal Basis |
|---|---|---|---|
| **FIFO** (First-In, First-Out) | **100%** (1.0 BTC) | **33.3%** (1.0 BTC) | Time-ordered accounting; assumes oldest coins are disbursed first. |
| **Haircut** (Proportional) | **50%** (0.5 BTC) | **50%** (1.5 BTC) | Pro-rata dilution across all recipients; favored in bankruptcy & restitution. |
| **Poison** (Strict Contamination) | **100%** (1.0 BTC) | **100%** (3.0 BTC) | Zero-tolerance AML; any dirty satoshi poisons the entire output balance. |

> 🎨 **Interactive Feature:** Visual heatmap toggle directly on the graph canvas allows switching between FIFO, Haircut, and Poison taint flows in real time.

---

> 🎙️ **Speaker Notes:**  
> *"In forensic accounting, taint analysis determines how much dirty money flowed into a specific wallet. Different legal jurisdictions accept different accounting standards. Indian AML and PMLA cases often favor FIFO or Proportional Haircut, whereas international blacklists use Poison taint. Instead of locking investigators into one arbitrary standard, AegisTrace calculates all three simultaneously. An investigator can click between Haircut, FIFO, and Poison to see exact Satoshi-level taint percentages rendered as visual heatmaps on the graph."*

---

<!-- 
===================================================================
SLIDE 7: FEATURE 3 — CIOH & HEURISTIC CLUSTERING
Duration: 1.5 mins
=================================================================== 
-->

## 👥 Core Engine 3: Wallet Clustering via DSU & CIOH

Criminals distribute funds across hundreds of addresses, but they all originate from the same private key holders.

```
        Input Address 1 (bc1q_a) --\
        Input Address 2 (bc1q_b) ---> [ Multi-Input Tx ] ---> Output Address
        Input Address 3 (1A1z_c) --/
                  ||
                  v
   [ Disjoint Set Union (DSU) Engine ]
   ===> Co-Spent Entity Resolved: "Cluster #402 (Size: 3 Addresses, Total: 14.82 BTC)"
```

### Algorithmic Capabilities:
* **Common Input Ownership Heuristic (CIOH)**: Implemented using an optimized Disjoint Set Union (DSU) with path compression ($O(\alpha(N))$ time complexity).
* **CoinJoin & Mixing Filter**: Automatically identifies and exempts multi-party CoinJoin transactions (equal denomination outputs + non-correlated multi-signers) to prevent false cluster collapse.
* **Peel Chain Recurrence Identifier**: Detects chains where change output is repeatedly spent in subsequent 2-output transactions.
* **Fee-Habit Fingerprinting**: Analyzes fee-rate consistency (sat/vB) and Replace-By-Fee (RBF) signaling patterns to link disparate transactions to the same wallet software.

---

> 🎙️ **Speaker Notes:**  
> *"A common misconception is that one Bitcoin address equals one person. In reality, a modern wallet generates a fresh address for every transaction. To prove that 50 addresses belong to the same narcotics syndicate, we implement the Common Input Ownership Heuristic, or CIOH. When multiple addresses are signed as inputs in a single transaction, the mathematical premise is that they are controlled by the same wallet entity. We process these co-spending links through an optimized Disjoint Set Union data structure, while prudently filtering out CoinJoins so we don't accidentally cluster unrelated users."*

---

<!-- 
===================================================================
SLIDE 8: FEATURE 4 — OBFUSCATION & TYPOLOGY DETECTION
Duration: 1.5 mins
=================================================================== 
-->

## 🎭 Core Engine 4: Obfuscation Forensics & Typology Classifier

AegisTrace automatically categorizes transaction patterns into established financial crime typologies:

```
+-----------------------------------------------------------------------------------+
|                        DETECTED LAUNDERING TYPOLOGIES                             |
+-----------------------------------------------------------------------------------+
|  [!] CoinJoin Mixer Pattern: Wasabi / Whirlpool Structure Detected                |
|      * 5+ identical value outputs (e.g. 0.05 BTC each)                             |
|      * Uniform fee-distribution & high entropy                                     |
|      * Action: Automatic branch prune & halt flag                                 |
+-----------------------------------------------------------------------------------+
|  [!] Rapid Relay Structuring (Smurfing):                                          |
|      * Dwell time < 2 blocks (sub-20 minute pass-through)                         |
|      * Hop velocity: 8 hops in under 2 hours without dormancy                     |
+-----------------------------------------------------------------------------------+
|  [!] Fan-Out / Sweep Consolidation:                                               |
|      * 1-to-N dispersion followed by N-to-1 sweep into unspent cold storage       |
+-----------------------------------------------------------------------------------+
|  [!] Cross-Case Syndicate Overlap:                                                |
|      * Shared deposit addresses identified between Case #102 and Case #104        |
+-----------------------------------------------------------------------------------+
```

> 🛡️ **Investigator Benefit:** Flags sophisticated obfuscation tactics instantly, directing the investigator to the liquidation chokepoint rather than chasing dead-end mixer branches.

---

> 🎙️ **Speaker Notes:**  
> *"When criminals realize they are being monitored, they use obfuscation toolkits. AegisTrace has dedicated pattern detectors for: First, CoinJoin mixers like Wasabi or Whirlpool — it detects symmetrical output structures and halts futile branch expansion. Second, Rapid Relay Structuring — where funds bounce across 8 wallets in 90 minutes with zero holding time. Third, Sweep Consolidations — where 30 mule addresses dump funds into one master treasury. Fourth, Cross-Case Syndicate Correlation — matching addresses across active independent investigations to reveal coordinated cartel rings."*

---

<!-- 
===================================================================
SLIDE 9: FEATURE 5 — 5-DIMENSIONAL RISK SCORING RADAR
Duration: 1.5 mins
=================================================================== 
-->

## 📊 Core Engine 5: Multi-Dimensional Risk Scoring Engine

Rather than an arbitrary high/low label, AegisTrace computes a balanced, multi-dimensional risk matrix across 5 distinct axes:

```
                           [Velocity Risk]
                                85/100
                                  /\
                                 /  \
     [Obfuscation Risk] 90/100  /    \  70/100 [Taint Concentration]
                               /      \
                              /________\
         [Sanction / OSINT]  75/100    80/100  [Hop Proximity]
```

### Risk Assessment Dimensions:
1. **Taint Concentration Score (Weight 25%)**: Proportional volume of illicit satoshis relative to total balance.
2. **Velocity & Dwell Score (Weight 20%)**: Speed of transit; high-velocity pass-through signifies robotic laundering.
3. **Obfuscation Indicator (Weight 25%)**: Presence of peel chains, mixers, script anomalies, or bridge contracts.
4. **Hop Proximity Score (Weight 15%)**: Topological distance from the original crime genesis UTXO.
5. **Entity & OSINT Exposure (Weight 15%)**: Cross-matches against known darknet markets, sanctioned entities, and flagged exchange deposit addresses.

> 🎯 **Composite Output:** Normalizes to an overall **Risk Index (0-100)** with an explanatory risk badge: `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.

---

> 🎙️ **Speaker Notes:**  
> *"Single-score risk models are easily manipulated or misunderstood. AegisTrace breaks risk into five transparent, quantifiable axes: Velocity, Obfuscation, Taint, Hop Proximity, and OSINT Exposure. If an address has high taint but zero velocity and sits in a verified cold storage wallet, its profile is completely different from an address with medium taint moving at high velocity through a mixer. Our radar visualizer renders these five dimensions clearly for court officers and senior supervisory review."*

---

<!-- 
===================================================================
SLIDE 10: LEGAL ADMISSIBILITY — SECTION 67 & SECTION 65B
Duration: 2.0 mins
=================================================================== 
-->

## ⚖️ Evidentiary Integrity: Court-Admissible Under Indian Law

A technical investigation is useless if the evidence is thrown out of court on procedural or provenance grounds.

### 1. Request worksheet (draft only)
* A worksheet can collect case reference, proposed recipient, address, and amount for later authorized review.
* It is not a statutory notice, makes no verified attribution or records demand, and does not establish legal authority or jurisdiction.

### 2. Section 65B BSA 2023 / Indian Evidence Act (Digital Evidence Certificate)
* **Digest checks**: Selected stored case and transfer event data can be hashed to detect later changes to the hashed content.
* **Limits**: Digests are not digitally signed, externally anchored, or proof of source authenticity; ordinary user interactions are not all logged.
* **Draft Export**: Generates a review worksheet with digest and provenance fields. It is not a Section 65B/63 certificate and is not court-ready evidence.

---

> 🎙️ **Speaker Notes:**  
> *"The evidence workflow records a digest of selected case data and a transfer-event digest trail. These browser-generated hashes can reveal later changes to the hashed content, but they are not digitally signed, independently timestamped, externally anchored, or proof of source authenticity. The application does not determine legal admissibility, issue Section 65B/63 certificates, or send statutory notices."*

---

<!-- 
===================================================================
SLIDE 11: MEMPOOL ZERO-CONF & WATCHLIST MONITORING
Duration: 1.5 mins
=================================================================== 
-->

## ⏱️ Real-Time Intelligence: 0-Conf Mempool & Watchlist

Investigators cannot afford to wait 60 minutes for 6 blockchain confirmations while a suspect is cashing out illicit gains.

```
       [Watched Bitcoin Address] (user supplied)
               |
               | (Broadcasting transaction to Bitcoin P2P network)
               v
  +---------------------------------------------------------------------+
  |       AEGIS-TRACE ADDRESS-SPECIFIC MEMPOOL ALERTS                   |
  |  * Subscribes to watched address activity over a public WebSocket   |
  |  * Shows matching unconfirmed transactions when received            |
  |  * Does not prevent transactions or contact an exchange              |
  +---------------------------------------------------------------------+
               |
               v
  [Analyst]: Independently review activity and decide next steps
```

* **Target Watchlist Engine**: Maintain persistent case watchlists with local alerts.
* **Activity alerts**: Delivery depends on the public data provider and network connection. Alerts are not guaranteed instant, do not intercept funds, and do not prove address ownership.

---

> 🎙️ **Speaker Notes:**  
> *"AegisTrace can subscribe to public mempool updates for watched Bitcoin addresses and display matching unconfirmed activity. Delivery depends on the provider and connection. An alert does not prevent confirmation, establish address ownership, or send a freeze request."*

---

<!--
===================================================================
SLIDE 12: LIVE DEMO INPUTS — TRACING & WATCHLIST
Duration: 2.0 mins
===================================================================
-->

## 🧭 Live Demo Inputs: Trace & Watchlist

### A. Trace a historical transaction
1. Open **Dashboard** and paste this Bitcoin transaction ID:

   `f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16`
2. Set **Trace depth** to `2`, then click **Trace**.
3. In the graph, inspect the transaction outputs, output indexes, followed spend edges, and candidate payment/change labels.

This is a historic Satoshi-to-Hal transaction used as a payment/change example. It is not an illicit transaction. The trace is fetched live, so provider availability can affect the demonstration.

### B. Add an address to the watchlist
In **Watchlist**, enter:

| Field | Example input |
|---|---|
| Bitcoin address | `1HB5XMLmzFVj8ALj6mfBsbifRoD4miY36v` |
| Label | `Presentation demo — public reference` |
| Group | `AegisTrace walkthrough` |
| Risk tier | `Unassessed` |

Click **Add**, then run the manual check for the address. It is a public donation-address reference, not a suspect label. A quiet or unavailable result is a valid demo outcome; do not promise an alert.

> ⚠️ **Privacy:** A live mempool check sends the entered address to the public provider. Use only a public example for this presentation.

---

<!--
===================================================================
SLIDE 13: LIVE DEMO INPUTS — RECOVERY & EVIDENCE REVIEW
Duration: 2.0 mins
===================================================================
-->

## 🧾 Live Demo Inputs: Recovery & Evidence Review

### C. Create a recovery follow-up
1. Select the built-in case **BTC Transaction Trace: 4b9a8f2e...** and open **Recovery**.
2. Inspect the terminal lead and its value, transaction-reference coverage, destination evidence, and unknowns.
3. Add a follow-up action:

| Field | Example input |
|---|---|
| Action type | `Prepare preservation request` |
| Evidence reference or case note | `Presentation exercise only — no request prepared or submitted` |
| Follow-up due date | `2026-11-11` (or choose a future date for your presentation) |

Leave the action **planned** or move it to **preparing**. The built-in case is synthetic, its graph edges do not include transaction IDs, and its displayed amounts are illustrative—not real trace evidence. Do not mark recovery confirmed.

### D. Review an evidence claim
Open **Evidence review** for the same case and add:

| Field | Example input |
|---|---|
| Claim classification | `Attribution hypothesis` |
| Claim or finding | `The terminal node may represent a service deposit; the owner is not established.` |
| Source / evidence reference | `Presentation exercise — no independent attribution source supplied` |
| Reviewer note | `Exercise only; source not independently checked; no identity conclusion.` |
| Review state | `Reviewed by investigator` |

The note is required before changing the review state. Also point out that the ledger keeps graph/on-chain references separate from investigator-entered hypotheses. A review state documents workflow; it does not authenticate the source or prove ownership.

---

<!--
===================================================================
SLIDE 14: LIVE WALKTHROUGH — SYNTHETIC TRACE CASE
Duration: 2.5 mins
===================================================================
-->

## 🎯 Walkthrough: Built-In Synthetic Trace Case

Use the built-in case **BTC Transaction Trace: 4b9a8f2e...**. This is a fabricated graph for demonstrating the workflow; it is not a real transaction or a real investigation.

```
[Start wallet]
  └─ 10.50 BTC → [Step 1]
                 └─ 9.20 BTC → [Step 2]
                                └─ 9.05 BTC → [End receiver]
```

### What to demonstrate
1. Select the end receiver and inspect its graph position and recorded flow amount.
2. Open **Recovery** and review the lead, including unknown transaction-reference coverage.
3. Open **Evidence review** and explain why the graph record is not an identity claim.

---

> 🎙️ **Speaker Notes:**  
> *"This is the built-in synthetic case. Its displayed flow amounts and node labels are demo data; the graph links do not provide real transaction references. We can show how the product organizes a lead and evidence gaps, but we cannot infer a real owner, service, illicit source, or recoverable balance from this fixture."*

---

<!--
===================================================================
SLIDE 15: TECHNICAL RIGOR, TESTING & PERFORMANCE
Duration: 1.5 mins
===================================================================
-->

## 🧪 Technical Rigor: Engineering & Verification Standards

A forensic tool must be flawless in its mathematical computations. A single calculation bug could invalidate a criminal prosecution.

```
+-----------------------------------------------------------------------------------+
|                        TEST SUITE & CODE QUALITY METRICS                          |
+-----------------------------------------------------------------------------------+
|  [✓] Test Engine: Vitest 3.2 (Sub-second In-Memory Execution)                     |
|  [✓] Test Suites: 21 Dedicated Forensic Suites Passed (100% Green)                |
|  [✓] Unit Tests: 221 Automated Assertions across 33 Suites Validating:             |
|      * Satoshi-level arithmetic correctness (no floating-point rounding bugs)     |
|      * Taint propagation parity across FIFO, Haircut, and Poison models           |
|      * DSU disjoint-set union path compression & cluster consolidation            |
|      * SHA-256 cryptographic chain-of-custody hash verification                   |
|      * Cross-chain bridge memo decoding & multi-chain destination extraction      |
|      * Dual-gateway failover simulation and rate-limiting circuit breakers        |
|  [✓] Linter: OxLint (Rust-based ultra-fast linter, zero undefined symbol tolerance)|
|  [✓] Production Build: Pure ESM via Vite 8; browser application build completes   |
+-----------------------------------------------------------------------------------+
```

---

> 🎙️ **Speaker Notes:**  
> *"The project includes automated tests for transaction parsing, tracing, heuristic analysis, value-flow calculations, and digest checks. Test results are regression checks; they do not demonstrate field accuracy, legal admissibility, absence of defects, or production readiness."*

---

<!--
===================================================================
SLIDE 16: FUTURE ROADMAP & SCALABILITY
Duration: 1.0 min
===================================================================
-->

## 🚀 Future Roadmap: Expanding the Forensic Frontier

| Phase | Milestone | Technological Capability |
|---|---|---|
| **SIH Solution** | **Bitcoin Mainnet Engine** | Client-side tracing, heuristic classification, candidate clustering, and draft review worksheets. |
| **Phase 2 (Q4 2026)** | **Encrypted Local Storage** | IndexedDB migration (unlimited capacity), AES-GCM at-rest vault encryption & private node RPC mode. |
| **Phase 3 (Q1 2027)** | **Evidence Interoperability** | WebCrypto ECDSA/Ed25519 digital signing, STIX 2.1 intelligence sharing & Neo4j Cypher export. |
| **Phase 4 (Q2 2027)** | **Advanced De-anonymization**| CoinJoin Knapsack subset-sum solver, Lightning Network HTLC detection, and live Tron/EVM USDT tracing. |

---

> 🎙️ **Speaker Notes:**  
> *"The roadmap includes stronger local storage controls, signing and export options, and additional chain data sources. Those capabilities require separate implementation and validation. The current subset-sum tool returns bounded candidate partitions; it does not unmix CoinJoin transactions or identify participants. Cross-chain memo parsing proposes destination details but does not trace activity on another chain."*

---

<!--
===================================================================
SLIDE 17: SUMMARY & VALUE DELIVERED
Duration: 1.0 min
===================================================================
-->

## 🏁 Summary: Why AegisTrace Wins

* **Zero-Cost & Accessible**: Eliminates prohibitive SaaS subscription barriers for law enforcement agencies across India.
* **Zero-Trust OPSEC**: Runs 100% client-side; no suspect queries or case metadata are ever leaked to external commercial cloud providers.
* **Mathematically Transparent**: Every score, taint satoshi, and cluster grouping is backed by explainable, open algorithms.
* **Statutorily Compliant**: Bridges the critical gap between raw computer science and courtroom admissibility under the NDPS Act & Bharatiya Sakshya Adhiniyam.
* **Production-Ready & Tested**: Powered by React 19, Vite 8, dual live mainnet gateways, and 221 passing unit tests across 33 suites.

---

> 🎙️ **Speaker Notes:**  
> *"AegisTrace brings Bitcoin tracing, heuristic analysis, and case review tools into one workstation as a solution to the SIH problem statement. Its outputs are investigative leads that need independent source and attribution checks. It is not a production-certified system and does not establish legal admissibility. Thank you, and we look forward to your questions."*

---

<!--
===================================================================
SLIDE 18: APPENDIX — MENTOR / JURY Q&A CHEATSHEET
Duration: As needed for Q&A
===================================================================
-->

## 💡 Appendix: Anticipated Questions & Defense Answers

### Q1: "Why did you build this purely client-side without a Python/Node backend?"
* **Answer**: *"Operational Security (OPSEC) and privacy. If law enforcement runs a centralized backend server, any breach of that server exposes active covert investigations, suspect addresses, and target lists. Client-side execution guarantees zero centralized telemetry: case state lives strictly in the investigator's encrypted local browser storage."*

### Q2: "What if Blockstream or Mempool APIs go down or rate-limit you?"
* **Answer**: *"We engineered a dual-gateway failover layer in `bitcoinApi.js`. If Blockstream times out or issues HTTP 429, requests instantly and transparently failover to Mempool.space. In addition, an in-memory LRU cache prevents redundant network hits for visited transactions, and our forward crawler uses bounded concurrency."*

### Q3: "How does your tool handle CoinJoin mixers like Wasabi or Whirlpool?"
* **Answer**: *"CoinJoin transactions intentionally break the Common Input Ownership Heuristic. When AegisTrace detects identical-value multi-outputs with uniform fee distributions, it flags the transaction as a mixer pool, marks it in the typology engine, and halts automated branch traversal to avoid false cluster pollution."*

### Q4: "What does the evidence worksheet establish?"
* **Answer**: *"The application does not issue an evidence certificate or determine admissibility. Its digest trail can detect changes to selected stored content, but it is not signed, externally anchored, or proof that source data is authentic. Applicable legal requirements need independent review."*
