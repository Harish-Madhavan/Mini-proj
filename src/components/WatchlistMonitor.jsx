import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  PlusCircle, 
  Trash2, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Upload,
  ArrowRight,
  Bell
} from 'lucide-react';
import { useCase } from '../hooks/useCase';
import { useToast } from '../hooks/useToast';
import { 
  getWatchlist, 
  addToWatchlist, 
  removeFromWatchlist, 
  getMempoolAlerts, 
  saveMempoolAlerts, 
  checkAddressMempoolStatus 
} from '../utils/watchlistManager';
import { validateBtcAddress } from '../utils/forensicUtils';
import { getExplorerUrls } from '../utils/knownEntities';

export default function WatchlistMonitor() {
  const { activeCase, liveMode, handleSearch } = useCase();
  const { showToast } = useToast();

  const [watchlist, setWatchlist] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [newAddr, setNewAddr] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newSyndicate, setNewSyndicate] = useState('');
  const [newTier, setNewTier] = useState('CRITICAL');
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [mempoolResults, setMempoolResults] = useState({});

  useEffect(() => {
    setWatchlist(getWatchlist());
    setAlerts(getMempoolAlerts());
  }, []);

  const handleAdd = () => {
    const trimmed = newAddr.trim();
    if (!trimmed) {
      showToast("Please enter a Bitcoin address.", "warning");
      return;
    }

    const validation = validateBtcAddress(trimmed);
    if (!validation.isValid) {
      showToast(`Address warning: ${validation.error}`, "warning");
    }

    const res = addToWatchlist({
      address: trimmed,
      tag: newTag.trim() || 'Suspect Wallet',
      syndicate: newSyndicate.trim() || 'Open case',
      riskTier: newTier
    });

    if (res.success) {
      setWatchlist(res.watchlist);
      setNewAddr('');
      setNewTag('');
      setNewSyndicate('');
      showToast("Address added to watchlist.", "success");
    } else {
      showToast(res.message, "warning");
    }
  };

  const handleRemove = (address) => {
    const updated = removeFromWatchlist(address);
    setWatchlist(updated);
    showToast("Address removed.", "info");
  };

  const handleImportCaseSuspects = () => {
    if (!activeCase?.nodes?.length) {
      showToast("No addresses in the open case.", "warning");
      return;
    }

    const suspects = activeCase.nodes.filter(n => n.type === 'suspect' || n.type === 'hop');
    let addedCount = 0;

    suspects.forEach(node => {
      const addr = node.details?.address;
      if (addr && addr.length > 20 && !addr.startsWith('0x')) {
        const res = addToWatchlist({
          address: addr,
          tag: node.label || 'Case Target',
          syndicate: activeCase.title || 'Open case',
          riskTier: node.type === 'suspect' ? 'CRITICAL' : 'HIGH',
          notes: `Imported from Case: ${activeCase.id}`
        });
        if (res.success) addedCount++;
      }
    });

    setWatchlist(getWatchlist());
    showToast(`Imported ${addedCount} addresses from the open case.`, "success");
  };

  const handleCheckAddress = async (address) => {
    showToast(`Checking ${address.slice(0, 8)}...`, "info");
    const status = await checkAddressMempoolStatus(address, liveMode);
    setMempoolResults(prev => ({ ...prev, [address]: status }));

    if (status.hasMempoolTx) {
      const newAlert = {
        id: `alert_${Date.now()}`,
        address,
        txid: status.txid,
        amount: status.amount,
        feeRate: status.feeRate,
        type: status.type,
        timestamp: 'Just now',
        status: 'Unconfirmed'
      };
      const updatedAlerts = [newAlert, ...alerts.slice(0, 25)];
      setAlerts(updatedAlerts);
      saveMempoolAlerts(updatedAlerts);
      showToast(`Unconfirmed activity for ${address.slice(0, 8)}.`, "warning");
    } else {
      showToast("No unconfirmed activity.", "info");
    }
  };

  const handleCheckAll = async () => {
    setIsCheckingAll(true);
    showToast(`Checking ${watchlist.length} watched addresses...`, "info");

    // Bounded parallelism: chunks of 4 keep large watchlists fast without
    // hammering the gateway. Failed checks degrade to a quiet miss.
    const CONCURRENCY = 4;
    const queue = [...watchlist];
    const results = {};
    const hits = [];

    while (queue.length > 0) {
      const chunk = queue.splice(0, CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map(item => checkAddressMempoolStatus(item.address, liveMode))
      );
      settled.forEach((res, i) => {
        const item = chunk[i];
        const status = res.status === 'fulfilled'
          ? res.value
          : { hasMempoolTx: false, message: 'Check failed.' };
        results[item.address] = status;
        if (status.hasMempoolTx) hits.push({ item, status });
      });
      setMempoolResults(prev => ({ ...prev, ...results }));
    }

    const newAlertList = [...alerts];
    for (const { item, status } of hits) {
      newAlertList.unshift({
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        address: item.address,
        txid: status.txid,
        amount: status.amount,
        feeRate: status.feeRate,
        type: status.type,
        timestamp: 'Just now',
        status: 'Unconfirmed'
      });
    }

    setAlerts(newAlertList.slice(0, 30));
    saveMempoolAlerts(newAlertList.slice(0, 30));
    setIsCheckingAll(false);

    if (hits.length > 0) {
      showToast(`Scan complete: ${hits.length} active transaction(s).`, "warning");
    } else {
      showToast("Scan complete: nothing pending.", "success");
    }
  };

  const handleClearAlerts = () => {
    setAlerts([]);
    saveMempoolAlerts([]);
    showToast("Alerts cleared.", "info");
  };

  return (
    <div className="responsive-split-grid" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.5rem', minHeight: '520px' }}>
      
      {/* Left: Monitored Address Surveillance Pool */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Radio style={{ color: '#0ea5e9' }} /> Watchlist
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Watched addresses, checked against live mempool activity.
              </p>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleImportCaseSuspects}
              className="btn btn-outline"
              type="button"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
              title="Import all suspect and hop addresses from active case"
            >
              <Upload size={13} /> From open case
            </button>
            <button
              onClick={handleCheckAll}
              disabled={isCheckingAll || watchlist.length === 0}
              className="btn btn-primary"
              type="button"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <RefreshCw size={13} className={isCheckingAll ? "moving-dash" : ""} style={{ animation: isCheckingAll ? 'spin 1s linear infinite' : 'none' }} />
              {isCheckingAll ? "Scanning..." : "Scan all"}
            </button>
          </div>
        </div>

        {/* Add Address to Watchlist Form */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 0.8fr auto', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Bitcoin address"
            value={newAddr}
            onChange={(e) => setNewAddr(e.target.value)}
            className="input-field mono-addr"
            style={{ fontSize: '0.775rem' }}
          />
          <input
            type="text"
            placeholder="Label"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            className="input-field"
            style={{ fontSize: '0.775rem' }}
          />
          <input
            type="text"
            placeholder="Group"
            value={newSyndicate}
            onChange={(e) => setNewSyndicate(e.target.value)}
            className="input-field"
            style={{ fontSize: '0.775rem' }}
          />
          <select
            value={newTier}
            onChange={(e) => setNewTier(e.target.value)}
            className="select-field"
            style={{ fontSize: '0.775rem' }}
          >
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
          </select>
          <button
            onClick={handleAdd}
            className="btn btn-outline"
            type="button"
            style={{ padding: '0.45rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <PlusCircle size={15} /> Add
          </button>
        </div>

        {/* Watchlist Table */}
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.5rem' }}>Address</th>
                <th style={{ padding: '0.5rem' }}>Label</th>
                <th style={{ padding: '0.5rem' }}>Tier</th>
                <th style={{ padding: '0.5rem' }}>Waiting</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}><span style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {watchlist.map((item) => {
                const memRes = mempoolResults[item.address];
                const urls = getExplorerUrls(item.address);
                return (
                  <tr key={item.address} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span className="mono-addr" style={{ color: '#fff', fontSize: '0.75rem' }}>
                          {item.address.slice(0, 10)}...{item.address.slice(-8)}
                        </span>
                        {urls && (
                          <a href={urls.mempool} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)' }} title="Open in Mempool.space">
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                      <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>Added: {item.addedDate}</span>
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ fontWeight: 600 }}>{item.tag}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{item.syndicate}</div>
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span style={{ 
                        padding: '0.15rem 0.45rem', 
                        borderRadius: '4px', 
                        fontSize: '0.675rem', 
                        fontWeight: 700,
                        backgroundColor: item.riskTier === 'CRITICAL' ? 'rgba(239,68,68,0.15)' : item.riskTier === 'HIGH' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                        color: item.riskTier === 'CRITICAL' ? '#ef4444' : item.riskTier === 'HIGH' ? '#f59e0b' : '#10b981'
                      }}>
                        {item.riskTier}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      {memRes ? (
                        memRes.hasMempoolTx ? (
                          <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.725rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <AlertTriangle size={12} /> {memRes.amount} ({memRes.feeRate})
                          </span>
                        ) : (
                          <span style={{ color: '#10b981', fontSize: '0.725rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <CheckCircle size={12} /> Clean
                          </span>
                        )
                      ) : (
                        <button
                          onClick={() => handleCheckAddress(item.address)}
                          className="btn btn-outline"
                          type="button"
                          style={{ fontSize: '0.675rem', padding: '0.2rem 0.4rem' }}
                        >
                          Check
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                        <button
                          onClick={() => handleSearch(item.address)}
                          className="btn btn-outline"
                          type="button"
                          style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                          title="Trace forward in active case graph"
                        >
                          Trace <ArrowRight size={11} />
                        </button>
                        <button
                          onClick={() => handleRemove(item.address)}
                          className="btn btn-outline"
                          type="button"
                          style={{ padding: '0.2rem 0.4rem', color: 'var(--text-muted)' }}
                          title="Remove from surveillance"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: alerts feed */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bell style={{ color: '#eab308' }} size={20} />
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Waiting alerts</h3>
              <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Unconfirmed activity on watched addresses</span>
            </div>
          </div>

          {alerts.length > 0 && (
            <button
              onClick={handleClearAlerts}
              className="btn btn-outline"
              type="button"
              style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
            >
              Clear Log
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, maxHeight: '420px' }}>
          {alerts.length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <CheckCircle size={32} style={{ color: '#10b981', margin: '0 auto 0.5rem', opacity: 0.6 }} />
              Nothing pending. Watched addresses will appear here when they transact.
            </div>
          ) : (
            alerts.map((alert) => (
              <div 
                key={alert.id}
                style={{ 
                  backgroundColor: 'rgba(15, 23, 42, 0.75)', 
                  border: '1px solid rgba(234, 179, 8, 0.3)', 
                  borderRadius: '8px', 
                  padding: '0.8rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ 
                    fontSize: '0.675rem', 
                    fontWeight: 700, 
                    color: '#eab308', 
                    backgroundColor: 'rgba(234, 179, 8, 0.15)', 
                    padding: '0.1rem 0.4rem', 
                    borderRadius: '4px' 
                  }}>
                    {alert.status}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{alert.timestamp}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#fff' }}>{alert.amount}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fee: {alert.feeRate}</span>
                </div>

                <div className="mono-addr" style={{ fontSize: '0.725rem', color: 'var(--primary)' }}>
                  Target: {alert.address.slice(0, 12)}...{alert.address.slice(-6)}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }} className="mono-addr">
                    Transaction: {alert.txid.slice(0, 14)}...
                  </span>
                  <button
                    onClick={() => handleSearch(alert.address)}
                    className="btn btn-outline"
                    type="button"
                    style={{ fontSize: '0.675rem', padding: '0.15rem 0.4rem' }}
                  >
                    Trace
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
