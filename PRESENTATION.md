---
marp: true
theme: default
paginate: true
header: "AegisTrace — Bitcoin Blockchain Forensics Suite"
footer: "NCB / SIH-1675 | Confidential & Proprietary"
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
| **Evidentiary Standard** | Section 67 NDPS Act & Section 65B BSA 2023 (Hash-Chained Audit Ledger) |

> 🎙️ **Speaker Notes (Opening Pitch):**  
> *"Good morning respected mentors and evaluators. Today we present AegisTrace — an end-to-end, mathematically verifiable cryptocurrency forensics workstation engineered for agencies like India's Narcotics Control Bureau. When syndicates move illicit drug capital across the Bitcoin blockchain, they rely on complex layering — peel chains, CoinJoin mixers, smurfing, and nested exchange hops. Current commercial tools like Chainalysis operate as expensive, closed black boxes. AegisTrace brings transparent, verifiable forensic tracing directly into the investigator's hands on the live mainnet with zero server-side telemetry, cryptographic chain-of-custody, and automated court-admissible certificates."*

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
| **Legal Integration** | Generic PDF export | No legal artifacts | **Native Section 67 NDPS & Section 65B BSA** |
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

> 📊 **Result:** Every edge in AegisTrace displays an objective **Change Probability Confidence Score (0-100%)** with full rationale breakdown.

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

### 1. Section 67 NDPS Act, 1985 (Statutory Requisition Notices)
* Automated drafting of legal summon notices directed to Indian & International Crypto Asset Service Providers (VDA / CASPs like CoinDCX, WazirX, Binance, Kraken).
* Formal summons requiring KYC records, IP access logs, bank payout account details, and wallet ownership verification under statutory authority.

### 2. Section 65B BSA 2023 / Indian Evidence Act (Digital Evidence Certificate)
* **Cryptographic Hash-Chaining**: Every user interaction (import, trace, node expand, tag, export) is committed to an append-only, tamper-evident ledger where each entry is sealed with `SHA-256(prevHash + timestamp + payload)`.
* **State Verification**: Captures client user-agent, gateway latency, API response hash, and machine timestamp.
* **One-Click Export**: Generates court-ready, print-formatted Section 65B certificates with investigator signature blanks.

---

> 🎙️ **Speaker Notes:**  
> *"Now we come to one of our greatest competitive advantages: legal admissibility. Under Indian law, digital evidence presented in a trial court must strictly satisfy Section 65B of the Indian Evidence Act, now Section 63 of the Bharatiya Sakshya Adhiniyam, 2023. Defense attorneys routinely argue that screenshots could be doctored in DevTools. AegisTrace embeds an append-only, SHA-256 hash-chained Chain of Custody ledger. Every single network fetch, user click, and classification is cryptographically sealed in an immutable log. The application then automatically prints a formal Section 65B certificate alongside Section 67 NDPS summon notices to exchanges."*

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
       [Suspect Address] bc1q_narcotics_treasury...
               |
               | (Broadcasting transaction to Bitcoin P2P network)
               v
  +---------------------------------------------------------------------+
  |              AEGIS-TRACE 0-CONF MEMPOOL LEAK SENSOR                 |
  |  * Scans unconfirmed memory pool (0-conf)                           |
  |  * Detects outspend broadcast within seconds of network propagation |
  |  * Evaluates RBF (Replace-by-Fee) status & fee-bump attempts        |
  |  * Dispatches instant browser alert & logs pre-confirmation trail   |
  +---------------------------------------------------------------------+
               |
               v
  [Instant Action]: Trigger Section 67 freezing notice to destination exchange!
```

* **Target Watchlist Engine**: Maintain persistent case watchlists with local alerts.
* **Proactive Interception**: Gives enforcement officers a crucial 10-to-60 minute head-start to freeze accounts at domestic exchanges before the first block confirmation.

---

> 🎙️ **Speaker Notes:**  
> *"When a suspect initiates a cash-out transaction to an exchange, the transaction first sits in the Bitcoin Mempool — the waiting room before miners confirm it into a block. This window typically lasts between 10 to 60 minutes. AegisTrace features a zero-confirmation mempool monitoring sensor. As soon as a watched wallet broadcasts a transaction across the peer-to-peer network, our system captures the pending outspend in real time, inspects Replace-By-Fee flags, and alerts the investigator immediately. This gives law enforcement the critical minutes needed to issue an emergency freeze to the receiving exchange before the suspect withdraws fiat."*

---

<!-- 
===================================================================
SLIDE 12: LIVE WALKTHROUGH — CASE STUDY: OPERATION DARK MIRAGE
Duration: 2.5 mins
=================================================================== 
-->

## 🎯 Case Study Walkthrough: Operation Dark Mirage

A simulated real-world narcotics takedown demonstrating AegisTrace in action:

```
[Genesis Seizure: Darknet Vendor "HydraPhantom"]
  └─ Tx: 4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b
     │
     ├─ Hop 1: 8-Factor Classifier identifies 0.25 BTC payment vs 4.75 BTC change
     │
     ├─ Hop 2: Peel chain detection separates transit rollover from vendor payout
     │
     ├─ Hop 3: CoinJoin branch detected at Wasabi pool -> branch pruned & flagged
     │
     ├─ Hop 4: DSU Clustering combines 4 input wallets into Single Cartel Cluster #12
     │
     └─ Hop 5: Terminal Output matched to Exchange Deposit Script (KYC Endpoint)
```

### Forensic Outcome in AegisTrace:
1. **Graph Explorer**: Full interactive DAG showing 5 hops with edge taint percentages.
2. **Cluster Profile**: Cartel cluster identified with 18.4 BTC total received.
3. **Legal Output**: Section 67 Notice pre-populated with Exchange UID & Section 65B Certificate generated.

---

> 🎙️ **Speaker Notes:**  
> *"Let us walk through a live scenario from our built-in forensic corpus: Operation Dark Mirage. We start with a transaction hash seized from a darknet vendor's encrypted phone. We paste it into AegisTrace: instantly, the forward tracing engine unpacks the outputs. Hop 1 separates the change remainder. Hop 2 follows the peeling chain. At Hop 3, the suspect attempted to run funds through a CoinJoin mixer; our typology engine flags the mixer and protects the investigator from wasting time chasing dead ends. At Hop 5, we identify a terminal deposit output matching an exchange wallet structure. Within 60 seconds, the investigator has the exact deposit hash, the cluster entity, and a generated legal summon notice ready for service."*

---

<!-- 
===================================================================
SLIDE 13: TECHNICAL RIGOR, TESTING & PERFORMANCE
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
|  [✓] Unit Tests: 125 Individual Assertions Validating:                            |
|      * Satoshi-level arithmetic correctness (no floating-point rounding bugs)     |
|      * Taint propagation parity across FIFO, Haircut, and Poison models           |
|      * DSU disjoint-set union path compression & cluster consolidation            |
|      * SHA-256 cryptographic chain-of-custody hash verification                   |
|      * Dual-gateway failover simulation and rate-limiting timeouts                |
|  [✓] Linter: OxLint (Rust-based ultra-fast linter, zero undefined symbol tolerance)|
|  [✓] Production Build: Pure ESM via Vite 8; zero server runtime vulnerabilities   |
+-----------------------------------------------------------------------------------+
```

---

> 🎙️ **Speaker Notes:**  
> *"In legal forensics, technical rigor is paramount. A single floating-point rounding error in JavaScript could invalidate evidence regarding seized funds. AegisTrace is built with strict Satoshi-level integer arithmetic. Our codebase has 21 comprehensive Vitest test suites comprising over 125 individual unit tests covering our 8-factor heuristics, DSU clustering, taint mathematics, and hash-chained custody ledgers. Our code adheres to OxLint's strict Rust-based linting standards, ensuring high performance, zero memory leaks, and total reproducibility."*

---

<!-- 
===================================================================
SLIDE 14: FUTURE ROADMAP & SCALABILITY
Duration: 1.0 min
=================================================================== 
-->

## 🚀 Future Roadmap: Expanding the Forensic Frontier

| Phase | Milestone | Technological Capability |
|---|---|---|
| **Phase 1 (Current)** | **Bitcoin Mainnet Complete** | Client-side tracing, 8-factor classification, DSU clustering, Section 65B. |
| **Phase 2 (Q3 2026)** | **EVM & Smart Contract Tokens** | Tracing ERC-20 stablecoins (USDT / USDC) on Ethereum, Tron (TRC-20), and Polygon. |
| **Phase 3 (Q4 2026)** | **Cross-Chain Bridge Heuristics** | Graph stitching across Thorchain, Wormhole, and centralized bridge swap routers. |
| **Phase 4 (2027)** | **Local LLM Forensic Assistant** | Air-gapped on-device AI for generating natural-language court prosecution briefs. |
| **Phase 5 (2027)** | **Hardware Security Module (HSM)** | Direct USB cryptographic token signing (e-Mudhra / FIPS-140) for Section 65B seals. |

---

> 🎙️ **Speaker Notes:**  
> *"Looking ahead, our roadmap builds directly upon AegisTrace's modular foundation. In Phase 2, we are expanding our heuristic graph model to EVM chains and Tron TRC-20, which handle high volumes of illicit stablecoin transfers like USDT. In Phase 3, we address cross-chain bridges. In Phase 4, we plan to integrate lightweight, local air-gapped LLMs to synthesize complex graph topologies into automated narrative charge-sheets. AegisTrace is designed not just for today's Bitcoin cases, but as an evolving platform for the future of digital asset law enforcement."*

---

<!-- 
===================================================================
SLIDE 15: SUMMARY & VALUE DELIVERED
Duration: 1.0 min
=================================================================== 
-->

## 🏁 Summary: Why AegisTrace Wins

* **Zero-Cost & Accessible**: Eliminates prohibitive SaaS subscription barriers for law enforcement agencies across India.
* **Zero-Trust OPSEC**: Runs 100% client-side; no suspect queries or case metadata are ever leaked to external commercial cloud providers.
* **Mathematically Transparent**: Every score, taint satoshi, and cluster grouping is backed by explainable, open algorithms.
* **Statutorily Compliant**: Bridges the critical gap between raw computer science and courtroom admissibility under the NDPS Act & Bharatiya Sakshya Adhiniyam.
* **Production-Ready & Tested**: Powered by React 19, Vite 8, dual live mainnet gateways, and 125+ passing unit tests.

---

> 🎙️ **Speaker Notes:**  
> *"To conclude: AegisTrace is not a theoretical concept or a simple UI mockup. It is a production-ready, mathematically rigorous blockchain forensics workstation built specifically to solve the real operational challenges faced by the Narcotics Control Bureau and law enforcement agencies. It protects national security and operational privacy, eliminates multi-million rupee foreign software dependencies, and delivers ironclad, court-admissible evidence. Thank you, and we look forward to your questions."*

---

<!-- 
===================================================================
SLIDE 16: APPENDIX — MENTOR / JURY Q&A CHEATSHEET
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

### Q4: "How does your Section 65B certificate hold up against defense challenges in court?"
* **Answer**: *"Defense counsel usually attacks digital evidence by alleging tampering between collection and trial. AegisTrace builds an append-only, SHA-256 hash-chained Chain of Custody ledger. Any modification to a single past node or timestamp breaks the mathematical hash chain, providing verifiable tamper-evidence as required by the Indian Evidence Act / BSA 2023."*
