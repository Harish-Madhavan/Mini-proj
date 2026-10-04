import React, { useState, useEffect } from 'react';
import {
  Radio,
  PlusCircle,
  Trash2,
  ExternalLink,
  RefreshCw,
  CheckCircle,
  Upload,
  ArrowRight,
  FileText
} from 'lucide-react';
import { useCase } from '../hooks/useCase';
import { useToast } from '../hooks/useToast';
import { 
  getWatchlist, 
  addToWatchlist, 
  removeFromWatchlist, 
  getMempoolAlerts, 
  saveMempoolAlerts, 
  checkAddressMempoolStatus,
  initMempoolWebSocket,
  closeMempoolWebSocket,
  onMempoolAlert,
  onMempoolStatusChange,
  getWebSocketStatus
} from '../utils/watchlistManager';
import { validateBtcAddress } from '../utils/forensicUtils';
import { getExplorerUrls } from '../utils/knownEntities';
import EmptyState from './EmptyState';
import BatchAddressImporter from './BatchAddressImporter';

export default function WatchlistMonitor() {
  const { activeCase, liveMode, handleSearch } = useCase();
  const { showToast } = useToast();

  const [watchlist, setWatchlist] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [form, setForm] = useState({ address: '', tag: '', syndicate: '', tier: 'CRITICAL' });
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [mempoolResults, setMempoolResults] = useState({});
  const [wsStatus, setWsStatus] = useState(() => getWebSocketStatus());
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  useEffect(() => {
    setWatchlist(getWatchlist());
    setAlerts(getMempoolAlerts());

    // Connect to WebSocket if live
    if (liveMode) {
      initMempoolWebSocket();
    }

    const unsubAlert = onMempoolAlert((newAlert) => {
      setAlerts(prev => [newAlert, ...prev.filter(a => a.txid !== newAlert.txid)].slice(0, 30));
      showToast(`⚡ 0-Conf Alert: ${newAlert.amount} broadcast for watched wallet!`, 'warning', 5000);
    });

    const unsubStatus = onMempoolStatusChange((status) => {
      setWsStatus(status);
    });

    return () => {
      unsubAlert();
      unsubStatus();
      closeMempoolWebSocket();
    };
  }, [liveMode, showToast]);

  const handleAdd = () => {
    const trimmed = form.address.trim();
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
      tag: form.tag.trim() || 'Suspect Wallet',
      syndicate: form.syndicate.trim() || 'Open case',
      riskTier: form.tier
    });

    if (res.success) {
      setWatchlist(res.watchlist);
      setForm({ address: '', tag: '', syndicate: '', tier: 'CRITICAL' });
      showToast("Address added to watchlist.", "success");
    } else {
      showToast(res.message, "warning");
    }
  };

  const handleRemove = (address) => {
    setWatchlist(removeFromWatchlist(address));
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
        const status = res.status === 'fulfilled' ? res.value : { hasMempoolTx: false, message: 'Check failed.' };
        results[item.address] = status;
        if (status.hasMempoolTx) hits.push({ item, status });
      });
      setMempoolResults(prev => ({ ...prev, ...results }));
    }

    const newAlertList = hits.map(({ item, status }) => ({
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      address: item.address,
      txid: status.txid,
      amount: status.amount,
      feeRate: status.feeRate,
      type: status.type,
      timestamp: 'Just now',
      status: 'Unconfirmed'
    })).concat(alerts).slice(0, 30);

    setAlerts(newAlertList);
    saveMempoolAlerts(newAlertList);
    setIsCheckingAll(false);

    showToast(hits.length > 0 ? `Scan complete: ${hits.length} active transaction(s).` : "Scan complete: nothing pending.", hits.length > 0 ? "warning" : "success");
  };

  const handleClearAlerts = () => {
    setAlerts([]);
    saveMempoolAlerts([]);
    showToast("Alerts cleared.", "info");
  };

  return (
    <div className="responsive-split-grid" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '2rem' }}>
      
      {/* Monitored Address Surveillance Pool */}
      <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Radio size={15} style={{ color: 'var(--text-muted)' }} /> Watchlist
              </h3>
              {wsStatus === 'CONNECTED' ? (
                <span style={{ fontSize: '0.72rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span className="live-beacon" style={{ width: '6px', height: '6px' }}></span> 0-Conf WS Live
                </span>
              ) : wsStatus === 'CONNECTING' ? (
                <span style={{ fontSize: '0.72rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 7px', borderRadius: '10px' }}>
                  Connecting WS…
                </span>
              ) : null}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.15rem' }}>
              Sub-second mempool surveillance & 0-confirmation transaction interception.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setIsBatchModalOpen(true)}
              className="btn-quiet"
              type="button"
              style={{ fontSize: '0.8rem' }}
              title="Batch import addresses from CSV or forensic dump"
            >
              <FileText size={13} /> Batch CSV
            </button>
            <button
              onClick={handleImportCaseSuspects}
              className="btn-quiet"
              type="button"
              style={{ fontSize: '0.8rem' }}
              title="Import all suspect and hop addresses from active case"
            >
              <Upload size={13} /> From case
            </button>
            <button
              onClick={handleCheckAll}
              disabled={isCheckingAll || watchlist.length === 0}
              className="btn btn-primary"
              type="button"
              style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <RefreshCw size={13} />
              {isCheckingAll ? "Scanning..." : "Scan all"}
            </button>
          </div>
        </div>

        {/* Add Address Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Bitcoin address..."
            value={form.address}
            onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
            className="input-field mono-addr"
            style={{ fontSize: '0.82rem', width: '100%' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Label"
            value={form.tag}
            onChange={(e) => setForm(prev => ({ ...prev, tag: e.target.value }))}
            className="input-field"
            style={{ fontSize: '0.8rem' }}
          />
          <input
            type="text"
            placeholder="Group"
            value={form.syndicate}
            onChange={(e) => setForm(prev => ({ ...prev, syndicate: e.target.value }))}
            className="input-field"
            style={{ fontSize: '0.8rem' }}
          />
          <select
            value={form.tier}
            onChange={(e) => setForm(prev => ({ ...prev, tier: e.target.value }))}
            className="select-field"
            style={{ fontSize: '0.8rem', background: 'transparent', borderColor: 'transparent', color: 'var(--text-muted)' }}
          >
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
          </select>
          <button
            onClick={handleAdd}
            className="btn btn-primary"
            type="button"
            style={{ fontSize: '0.8rem' }}
          >
            <PlusCircle size={14} /> Add
          </button>
          </div>
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
                  <tr key={item.address} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <td style={{ padding: '0.55rem 0.5rem 0.55rem 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span className="mono-addr" style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          {item.address.slice(0, 10)}...{item.address.slice(-8)}
                        </span>
                        {urls && (
                          <a href={urls.mempool} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)' }} title="Open in Mempool.space">
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.55rem 0.5rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{item.tag}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{item.syndicate}</div>
                    </td>
                    <td style={{ padding: '0.55rem 0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {item.riskTier.toLowerCase()}
                    </td>
                    <td style={{ padding: '0.55rem 0.5rem', fontSize: '0.78rem' }}>
                      {memRes ? (
                        memRes.hasMempoolTx ? (
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                            {memRes.amount} · {memRes.feeRate}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>
                            Quiet
                          </span>
                        )
                      ) : (
                        <button onClick={() => handleCheckAddress(item.address)} className="btn-quiet" type="button" style={{ fontSize: '0.78rem' }}>
                          Check
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '0.55rem 0', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.15rem' }}>
                        <button onClick={() => handleSearch(item.address)} className="btn-quiet" type="button" style={{ fontSize: '0.78rem' }} title="Trace forward in active case graph">
                          Trace <ArrowRight size={11} />
                        </button>
                        <button onClick={() => handleRemove(item.address)} className="icon-btn" type="button" title="Remove from surveillance" aria-label={`Remove ${item.address}`}>
                          <Trash2 size={13} />
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
      <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Alerts</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Unconfirmed activity</span>
          </div>

          {alerts.length > 0 && (
            <button onClick={handleClearAlerts} className="btn-quiet" type="button" style={{ fontSize: '0.78rem' }}>
              Clear
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', flex: 1, maxHeight: '420px' }}>
          {alerts.length === 0 ? (
            <EmptyState icon={<CheckCircle size={28} style={{ opacity: 0.5 }} />}>
              Nothing pending. Watched addresses will appear here when they transact.
            </EmptyState>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                style={{
                  padding: '0.7rem 0',
                  borderBottom: '1px solid var(--border-soft)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <strong style={{ fontSize: '0.86rem' }}>{alert.amount}</strong>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{alert.feeRate} · {alert.timestamp}</span>
                </div>

                <div className="mono-addr" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  {alert.address.slice(0, 12)}...{alert.address.slice(-6)} · {alert.txid.slice(0, 12)}...
                </div>

                <div style={{ marginTop: '0.1rem' }}>
                  <button onClick={() => handleSearch(alert.address)} className="btn-quiet" type="button" style={{ fontSize: '0.78rem', paddingLeft: 0 }}>
                    Trace <ArrowRight size={11} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <BatchAddressImporter
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        onImportComplete={() => setWatchlist(getWatchlist())}
      />

    </div>
  );
}
