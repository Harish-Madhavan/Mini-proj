import React, { useState } from 'react';
import {
  GitMerge,
  HelpCircle,
  Shuffle,
  UserCheck,
  PlusCircle,
  Trash2,
  ChevronRight,
  Download,
  Upload,
  CheckCircle,
  AlertCircle,
  Fingerprint
} from 'lucide-react';
import { fetchAddressTxs, fetchTx } from '../utils/bitcoinApi';
import { useCase } from '../hooks/useCase';
import { useToast } from '../hooks/useToast';
import { validateBtcAddress, exportToCsv } from '../utils/forensicUtils';
import { computeAddressClusters, detectPeelingChain, feeFingerprintSimilarity, estimatePoolReceived } from '../utils/clusteringAlgorithms';
import { downloadJson } from '../utils/download';
import EmptyState from './EmptyState';

function StatBox({ label, value, valueColor = '#fff', sub = null }) {
  return (
    <div style={{ backgroundColor: 'rgba(5, 8, 16, 0.8)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>{label}</span>
      <strong style={{ fontSize: '1.1rem', color: valueColor }}>{value}</strong>
      {sub && (
        <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem', marginTop: '0.15rem' }}>{sub}</span>
      )}
    </div>
  );
}

export default function HeuristicClustering() {
  const { activeCase } = useCase();
  const { showToast } = useToast();

  const [suspectAddresses, setSuspectAddresses] = useState([
    "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    "bc1q7w5pxj2lznq48as923kd8mzklaq02947alkwsj",
    "bc1qdf4w9sl2lznq48as923kd8mzklaq02947a11122"
  ]);
  const [newAddr, setNewAddr] = useState('');
  const [clusteringResult, setClusteringResult] = useState(null);
  const [isClustering, setIsClustering] = useState(false);
  const [feeTxA, setFeeTxA] = useState('');
  const [feeTxB, setFeeTxB] = useState('');
  const [feeResult, setFeeResult] = useState(null);
  const [isComparingFees, setIsComparingFees] = useState(false);

  const caseTxIds = (activeCase?.nodes || [])
    .filter(n => typeof n.id === 'string' && n.id.startsWith('tx_'))
    .map(n => n.id.slice(3));

  const handleCompareFees = async () => {
    const a = feeTxA.trim();
    const b = feeTxB.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(a) || !/^[0-9a-fA-F]{64}$/.test(b)) {
      showToast('Both inputs must be 64-character transaction IDs.', 'warning');
      return;
    }
    setIsComparingFees(true);
    setFeeResult(null);
    try {
      const [txA, txB] = await Promise.all([fetchTx(a), fetchTx(b)]);
      setFeeResult({ txidA: a, txidB: b, ...feeFingerprintSimilarity(txA, txB) });
    } catch (err) {
      showToast(`Fee comparison failed: ${err.message}`, 'error');
    } finally {
      setIsComparingFees(false);
    }
  };

  const handleAddAddress = () => {
    const trimmed = newAddr.trim();
    if (!trimmed) return;

    if (suspectAddresses.includes(trimmed)) {
      showToast("Address already added.", "warning");
      return;
    }

    const validation = validateBtcAddress(trimmed);
    if (!validation.isValid) {
      showToast(`Address warning: ${validation.error}`, "warning");
    }

    setSuspectAddresses([...suspectAddresses, trimmed]);
    setNewAddr('');
    showToast(`Added ${validation.type} address.`, "info");
  };

  const handleImportFromGraph = () => {
    if (!activeCase?.nodes?.length) {
      showToast("No addresses in the open case.", "warning");
      return;
    }

    const addressesFromGraph = activeCase.nodes
      .map(n => n.details?.address)
      .filter(Boolean)
      .filter(addr => !addr.startsWith('0x') && (addr.startsWith('bc1') || addr.startsWith('1') || addr.startsWith('3') || addr.length > 20));

    const uniqueAddrs = Array.from(new Set([...suspectAddresses, ...addressesFromGraph]));
    const newlyAdded = uniqueAddrs.length - suspectAddresses.length;

    setSuspectAddresses(uniqueAddrs);
    showToast(`Imported ${newlyAdded} addresses from the open case.`, "success");
  };

  const handleRemoveAddress = (index) => {
    const updated = suspectAddresses.filter((_, i) => i !== index);
    setSuspectAddresses(updated);
    showToast("Address removed.", "info");
  };

  const runClustering = async () => {
    setIsClustering(true);
    setClusteringResult(null);

    const addrs = suspectAddresses;
    const transactions = [];

    // Check if any of the addresses are real BTC addresses and fetch live transactions
    const btcAddrs = addrs.filter(a => a.startsWith('bc1') || a.startsWith('1') || a.startsWith('3'));
    
    if (btcAddrs.length >= 2) {
      try {
        const txHistories = await Promise.allSettled(
          btcAddrs.map(addr => fetchAddressTxs(addr))
        );

        txHistories.forEach(res => {
          if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            res.value.forEach(tx => transactions.push(tx));
          }
        });
      } catch (e) {
        console.warn("Live CIOH check fallback:", e);
      }
    }

    const clusterAnalysis = computeAddressClusters(addrs, transactions);
    const peelingAnalysis = detectPeelingChain(transactions);

    if (peelingAnalysis.isPeelingChain) {
      clusterAnalysis.heuristicsApplied.push(
        `Split pattern (${peelingAnalysis.hopCount} steps, average ${peelingAnalysis.averagePeelPercent}%)`
      );
    }

    // Received funds come from the fetched histories — never invented from
    // unrelated case balances.
    const { totalSats, observedTxCount } = estimatePoolReceived(addrs, transactions);

    setTimeout(() => {
      setIsClustering(false);
      setClusteringResult({
        ...clusterAnalysis,
        totalBalance: observedTxCount > 0 ? `${(totalSats / 1e8).toFixed(4)} BTC` : 'No history',
        observedTxCount,
      });
      showToast(`Done. Group ${clusterAnalysis.clusterId}`, "success");
    }, 400);
  };

  const handleExportCsv = () => {
    if (!clusteringResult) return;
    const rows = clusteringResult.addresses.map((addr, idx) => {
      const v = validateBtcAddress(addr);
      return {
        Index: idx + 1,
        ClusterID: clusteringResult.clusterId,
        Address: addr,
        ScriptFormat: v.type,
        Confidence: `${clusteringResult.confidenceScore}%`,
        EstimatedControlBalance: clusteringResult.totalBalance,
        ObservedTxs: clusteringResult.observedTxCount ?? 0
      };
    });

    exportToCsv(`NCB-Cluster-${clusteringResult.clusterId}.csv`, rows, [
      { key: 'Index', header: '#' },
      { key: 'ClusterID', header: 'Group ID' },
      { key: 'Address', header: 'Bitcoin address' },
      { key: 'ScriptFormat', header: 'Address type' },
      { key: 'Confidence', header: 'Confidence' },
      { key: 'EstimatedControlBalance', header: 'Received' },
      { key: 'ObservedTxs', header: 'Transactions checked' }
    ]);
    showToast("Group data downloaded.", "success");
  };

  const handleExportJson = () => {
    if (!clusteringResult) return;
    downloadJson(clusteringResult, `NCB-Cluster-${clusteringResult.clusterId}.json`);
    showToast("Group data downloaded (JSON).", "success");
  };

  const FEE_VERDICTS = {
    SAME_WALLET_LIKELY: 'Likely same wallet',
    DISTINCT_WALLETS: 'Likely different wallets',
    INCONCLUSIVE: 'Unclear',
  };

  const feeVerdictColor = feeResult
    ? feeResult.verdict === 'SAME_WALLET_LIKELY' ? '#f59e0b'
      : feeResult.verdict === 'DISTINCT_WALLETS' ? '#10b981' : 'var(--text-secondary)'
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
    <div className="responsive-split-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', minHeight: '500px' }}>
      
      {/* Input Wallet List panel */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <GitMerge style={{ color: '#a855f7' }} /> Shared spending
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Group addresses that spend together — they are probably one wallet.</p>
          </div>

          <button
            onClick={handleImportFromGraph}
            className="btn btn-outline"
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
            title="Import all addresses from the open case"
          >
            <Upload size={13} /> From graph
          </button>
        </div>

        {/* Add Address Form */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Enter a Bitcoin address..."
            value={newAddr}
            onChange={(e) => setNewAddr(e.target.value)}
            className="mono-addr input-field"
            style={{ flex: 1, fontSize: '0.8rem' }}
          />
          <button
            onClick={handleAddAddress}
            className="btn btn-outline"
          >
            <PlusCircle size={16} /> Add
          </button>
        </div>

        {/* List of Addresses */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto', maxHeight: '280px' }}>
          {suspectAddresses.map((addr, idx) => {
            const validation = validateBtcAddress(addr);
            return (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem', borderRadius: '6px', backgroundColor: 'rgba(5, 8, 16, 0.8)', border: '1px solid var(--border-color)', gap: '0.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', overflow: 'hidden' }}>
                  <span className="mono-addr" style={{ fontSize: '0.8rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{addr}</span>
                  <span style={{ fontSize: '0.65rem', color: validation.isValid ? '#10b981' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    {validation.isValid ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                    {validation.type}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveAddress(idx)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.7 }}
                  title="Remove address"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={runClustering}
          disabled={isClustering || suspectAddresses.length < 2}
          className="btn btn-primary"
          style={{ width: '100%', padding: '0.75rem', justifyContent: 'center', fontSize: '0.85rem' }}
        >
          <Shuffle size={16} /> {isClustering ? "Grouping..." : `Find groups (${suspectAddresses.length} addresses)`}
        </button>
      </div>

      {/* Cluster Output panel */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserCheck style={{ color: '#10b981' }} size={18} /> Results
          </h3>

          {clusteringResult && (
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                onClick={handleExportCsv}
                className="btn"
                title="Download CSV Evidence Table"
              >
                <Download size={13} /> CSV
              </button>
              <button
                onClick={handleExportJson}
                className="btn btn-outline"
                title="Download JSON Data"
              >
                <Download size={13} /> JSON
              </button>
            </div>
          )}
        </div>

        {clusteringResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Cluster ID Header */}
            <div style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)', border: '1px solid #a855f7', borderRadius: '8px', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group ID:</span>
                <h4 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginTop: '0.1rem' }}>{clusteringResult.clusterId}</h4>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Confidence:</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981' }}>{clusteringResult.confidenceScore}%</div>
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
              <StatBox label="Addresses:" value={clusteringResult.addressCount} />
              <StatBox
                label="Received:"
                value={clusteringResult.totalBalance}
                valueColor="var(--primary)"
                sub={clusteringResult.observedTxCount > 0
                  ? `Across ${clusteringResult.observedTxCount} checked transaction${clusteringResult.observedTxCount === 1 ? '' : 's'}`
                  : 'No history fetched'}
              />
            </div>

            {/* Heuristics Applied */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Why grouped:</span>
              {clusteringResult.heuristicsApplied.map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#cbd5e1', backgroundColor: 'rgba(255,255,255,0.02)', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <ChevronRight size={12} style={{ color: '#a855f7' }} /> {h}
                </div>
              ))}
            </div>

          </div>
        ) : (
          <EmptyState icon={<HelpCircle size={36} />}>
            Add 2 or more addresses, then Find groups.
          </EmptyState>
        )}
      </div>
    </div>

      {/* Fee habits */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Fingerprint size={18} /> Fee habits
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            Compare fee habits across two transactions.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }} className="responsive-split-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label htmlFor="fee-tx-a" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Transaction A</label>
            <input
              id="fee-tx-a"
              type="text"
              value={feeTxA}
              onChange={(e) => setFeeTxA(e.target.value)}
              placeholder="64-character transaction ID"
              list="case-txids"
              className="mono-addr input-field"
              style={{ fontSize: '0.75rem' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label htmlFor="fee-tx-b" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Transaction B</label>
            <input
              id="fee-tx-b"
              type="text"
              value={feeTxB}
              onChange={(e) => setFeeTxB(e.target.value)}
              placeholder="64-character transaction ID"
              list="case-txids"
              className="mono-addr input-field"
              style={{ fontSize: '0.75rem' }}
            />
          </div>
          <button
            onClick={handleCompareFees}
            disabled={isComparingFees}
            className="btn btn-primary"
            style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}
          >
            <Fingerprint size={14} /> {isComparingFees ? 'Fetching…' : 'Compare'}
          </button>
        </div>
        <datalist id="case-txids">
          {caseTxIds.map(txid => <option key={txid} value={txid} />)}
        </datalist>
        {feeResult ? (
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.9rem 1rem', backgroundColor: 'rgba(5,8,16,0.5)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span className="badge-pill" style={{ color: feeVerdictColor, border: `1px solid ${feeVerdictColor}55`, backgroundColor: `${feeVerdictColor}14` }}>
                {FEE_VERDICTS[feeResult.verdict] || feeResult.verdict}
              </span>
              <span style={{ fontSize: '0.8rem' }}>Similarity <strong>{Math.round(feeResult.similarity * 100)}%</strong></span>
              <span className="mono-addr" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {feeResult.rateA} vs {feeResult.rateB} satoshis per byte
              </span>
            </div>
            <div style={{ height: '5px', borderRadius: '3px', backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.round(feeResult.similarity * 100)}%`, height: '100%', backgroundColor: feeVerdictColor }} />
            </div>
            <div className="mono-addr" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
              A: {feeResult.txidA.slice(0, 16)}… · B: {feeResult.txidB.slice(0, 16)}… (checked live)
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {caseTxIds.length > 0
              ? `Enter two transaction IDs — or pick from the ${caseTxIds.length} in the open case — then compare.`
              : 'Enter two transaction IDs. Transactions from the open case appear as suggestions once traced.'}
          </p>
        )}
      </div>
    </div>
  );
}
