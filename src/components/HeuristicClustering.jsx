import React, { useState } from 'react';
import {
  GitMerge,
  HelpCircle,
  Shuffle,
  UserCheck,
  PlusCircle,
  Trash2,
  Download,
  Upload,
  Fingerprint
} from 'lucide-react';
import { fetchAddressTxs, fetchTx } from '../utils/bitcoinApi';
import { useCase } from '../hooks/useCase';
import { useToast } from '../hooks/useToast';
import { validateBtcAddress, exportToCsv } from '../utils/forensicUtils';
import { computeAddressClusters, detectPeelingChain, feeFingerprintSimilarity, estimatePoolReceived } from '../utils/clusteringAlgorithms';
import { downloadJson } from '../utils/download';
import EmptyState from './EmptyState';

function StatBox({ label, value, sub = null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', padding: '0.25rem 0' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{label}</span>
      <strong style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</strong>
      {sub && (
        <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{sub}</span>
      )}
    </div>
  );
}

function AddressRow({ addr, onRemove }) {
  const isEvm = addr.startsWith('0x');
  const isTron = addr.startsWith('T') && addr.length >= 33 && addr.length <= 35;
  const validation = validateBtcAddress(addr);
  const label = isEvm
    ? 'EVM address (cross-chain)'
    : isTron
      ? 'Tron address (cross-chain)'
      : validation.isValid ? validation.type : 'Unverified format';

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid var(--border-soft)', gap: '0.5rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <span className="mono-addr" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{addr}</span>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          {label}
        </span>
      </div>
      <button
        onClick={onRemove}
        className="icon-btn"
        title="Remove address"
        aria-label={`Remove ${addr}`}
      >
        <Trash2 size={14} />
      </button>
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
  const [feeTxs, setFeeTxs] = useState({ a: '', b: '' });
  const [feeResult, setFeeResult] = useState(null);
  const [isComparingFees, setIsComparingFees] = useState(false);

  const updateFeeTx = (field, val) => setFeeTxs(prev => ({ ...prev, [field]: val }));

  const caseTxIds = (activeCase?.nodes || [])
    .filter(n => typeof n.id === 'string' && n.id.startsWith('tx_'))
    .map(n => n.id.slice(3));

  const handleCompareFees = async () => {
    const a = feeTxs.a.trim();
    const b = feeTxs.b.trim();
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

        const seenTxIds = new Set();
        txHistories.forEach(res => {
          if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            res.value.forEach(tx => {
              const id = tx?.txid || tx?.id;
              if (id) {
                if (seenTxIds.has(id)) return;
                seenTxIds.add(id);
              }
              transactions.push(tx);
            });
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '1rem' }}>
    <div className="responsive-split-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
      
      {/* Input Wallet List panel */}
      <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <GitMerge size={15} style={{ color: 'var(--text-muted)' }} /> Shared spending
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.2rem' }}>Addresses that spend together are probably one wallet.</p>
          </div>

          <button
            onClick={handleImportFromGraph}
            className="btn-quiet"
            style={{ fontSize: '0.8rem' }}
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
            style={{ flex: 1, fontSize: '0.83rem' }}
          />
          <button
            onClick={handleAddAddress}
            className="btn btn-primary"
            style={{ fontSize: '0.82rem' }}
          >
            <PlusCircle size={14} /> Add
          </button>
        </div>

        {/* List of Addresses */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', maxHeight: '280px' }}>
          {suspectAddresses.map((addr, idx) => (
            <AddressRow
              key={idx}
              addr={addr}
              onRemove={() => handleRemoveAddress(idx)}
            />
          ))}
        </div>

        <button
          onClick={runClustering}
          disabled={isClustering || suspectAddresses.length < 2}
          className="btn btn-primary"
          style={{ width: '100%', padding: '0.7rem', justifyContent: 'center', fontSize: '0.84rem', marginTop: '0.25rem' }}
        >
          <Shuffle size={14} /> {isClustering ? "Grouping..." : `Find groups (${suspectAddresses.length} addresses)`}
        </button>
      </div>

      {/* Cluster Output panel */}
      <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <UserCheck size={15} style={{ color: 'var(--text-muted)' }} /> Results
          </h3>

          {clusteringResult && (
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                onClick={handleExportCsv}
                className="btn-quiet"
                style={{ fontSize: '0.8rem' }}
                title="Download CSV Evidence Table"
              >
                <Download size={13} /> CSV
              </button>
              <button
                onClick={handleExportJson}
                className="btn-quiet"
                style={{ fontSize: '0.8rem' }}
                title="Download JSON Data"
              >
                <Download size={13} /> JSON
              </button>
            </div>
          )}
        </div>

        {clusteringResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Cluster ID Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-soft)' }}>
              <div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{clusteringResult.clusterId}</span>
                {clusteringResult.isSplit && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    Split into {clusteringResult.clustersCount} groups — largest holds {clusteringResult.largestCluster?.length || 0}/{clusteringResult.addressCount}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, letterSpacing: '-0.02em' }}>{clusteringResult.confidenceScore}%</div>
            </div>

            {/* Metrics Breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem' }}>
              <StatBox label="Addresses" value={clusteringResult.addressCount} />
              <StatBox
                label="Received"
                value={clusteringResult.totalBalance}
                sub={clusteringResult.observedTxCount > 0
                  ? `Across ${clusteringResult.observedTxCount} checked transaction${clusteringResult.observedTxCount === 1 ? '' : 's'}`
                  : 'No history fetched'}
              />
            </div>

            {/* Heuristics Applied */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Why grouped</span>
              {clusteringResult.heuristicsApplied.map((h, i) => (
                <div key={i} style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', padding: '0.3rem 0', borderBottom: i < clusteringResult.heuristicsApplied.length - 1 ? '1px solid var(--border-soft)' : 'none' }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: '0.45rem' }}>·</span>{h}
                </div>
              ))}
            </div>

          </div>
        ) : (
          <EmptyState icon={<HelpCircle size={32} />}>
            Add 2 or more addresses, then Find groups.
          </EmptyState>
        )}
      </div>
    </div>

      {/* Fee habits */}
      <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Fingerprint size={15} style={{ color: 'var(--text-muted)' }} /> Fee habits
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Same wallet often pays similar fees.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }} className="responsive-split-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label htmlFor="fee-tx-a" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Transaction A</label>
            <input
              id="fee-tx-a"
              type="text"
              value={feeTxs.a}
              onChange={(e) => updateFeeTx('a', e.target.value)}
              placeholder="64-character transaction ID"
              list="case-txids"
              className="mono-addr input-field"
              style={{ fontSize: '0.8rem' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label htmlFor="fee-tx-b" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Transaction B</label>
            <input
              id="fee-tx-b"
              type="text"
              value={feeTxs.b}
              onChange={(e) => updateFeeTx('b', e.target.value)}
              placeholder="64-character transaction ID"
              list="case-txids"
              className="mono-addr input-field"
              style={{ fontSize: '0.8rem' }}
            />
          </div>
          <button
            onClick={handleCompareFees}
            disabled={isComparingFees}
            className="btn btn-primary"
            style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}
          >
            <Fingerprint size={14} /> {isComparingFees ? 'Checking…' : 'Compare'}
          </button>
        </div>
        <datalist id="case-txids">
          {caseTxIds.map(txid => <option key={txid} value={txid} />)}
        </datalist>
        {feeResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.75rem 0', borderTop: '1px solid var(--border-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.88rem' }}>
                {FEE_VERDICTS[feeResult.verdict] || feeResult.verdict}
              </strong>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{Math.round(feeResult.similarity * 100)}% similar</span>
              <span className="mono-addr" style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {feeResult.rateA} vs {feeResult.rateB} sat/vB
              </span>
            </div>
            <div className="mono-addr" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
              {feeResult.txidA.slice(0, 12)}… · {feeResult.txidB.slice(0, 12)}…
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {caseTxIds.length > 0
              ? `Pick from the ${caseTxIds.length} transactions in the open case, then compare.`
              : 'Enter two transaction IDs, then compare.'}
          </p>
        )}
      </div>
    </div>
  );
}
