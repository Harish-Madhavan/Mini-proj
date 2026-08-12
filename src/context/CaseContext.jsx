import React, { useState, useEffect, useCallback } from 'react';
import { SCENARIOS } from '../data/scenarios';
import { traceEndReceiver, fetchAddressTxs, formatBlockstreamTx } from '../utils/bitcoinApi';
import { createLiveTxCase, createAddressTraceCase, createAlgorithmicTraceCase } from '../utils/caseHelpers';
import { useToast } from '../hooks/useToast';
import { CaseContext } from './CaseContextObject';

export function CaseProvider({ children }) {
  const { showToast } = useToast();

  const [scenarios, setScenarios] = useState(() => {
    try {
      const saved = localStorage.getItem('aegistrace_scenarios');
      return saved ? JSON.parse(saved) : SCENARIOS;
    } catch {
      return SCENARIOS;
    }
  });

  const [activeCaseId, setActiveCaseId] = useState(() => {
    try {
      const saved = localStorage.getItem('aegistrace_activeCaseId');
      return saved || SCENARIOS[0].id;
    } catch {
      return SCENARIOS[0].id;
    }
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [liveMode, setLiveMode] = useState(true);
  const [isLoadingLive, setIsLoadingLive] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('aegistrace_scenarios', JSON.stringify(scenarios));
    } catch (e) {
      console.warn("Could not save scenarios to localStorage", e);
    }
  }, [scenarios]);

  useEffect(() => {
    try {
      localStorage.setItem('aegistrace_activeCaseId', activeCaseId);
    } catch (e) {
      console.warn("Could not save activeCaseId to localStorage", e);
    }
  }, [activeCaseId]);

  const activeCase = scenarios.find(s => s.id === activeCaseId) || scenarios[0] || SCENARIOS[0];

  const handleExportCase = useCallback(() => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(scenarios, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `aegistrace-cases-export-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast("Case investigation data exported successfully!", "success");
    } catch (err) {
      showToast(`Export failed: ${err.message}`, "error");
    }
  }, [scenarios, showToast]);

  const handleImportCase = useCallback((jsonObj) => {
    try {
      if (Array.isArray(jsonObj) && jsonObj.length > 0 && jsonObj[0].id && jsonObj[0].nodes) {
        setScenarios(jsonObj);
        setActiveCaseId(jsonObj[0].id);
        showToast("Investigation cases imported successfully!", "success");
      } else if (jsonObj.id && jsonObj.nodes) {
        setScenarios(prev => [jsonObj, ...prev.filter(s => s.id !== jsonObj.id)]);
        setActiveCaseId(jsonObj.id);
        showToast(`Case "${jsonObj.title || jsonObj.id}" imported successfully!`, "success");
      } else {
        showToast("Invalid case file format.", "error");
      }
    } catch (err) {
      showToast(`Import error: ${err.message}`, "error");
    }
  }, [showToast]);

  const handleResetCases = useCallback(() => {
    if (window.confirm("Reset all investigation traces to default state?")) {
      setScenarios(SCENARIOS);
      setActiveCaseId(SCENARIOS[0].id);
      localStorage.removeItem('aegistrace_scenarios');
      localStorage.removeItem('aegistrace_activeCaseId');
      showToast("Reset all investigation traces to defaults.", "info");
    }
  }, [showToast]);

  const handleSelectCase = useCallback((id) => {
    setActiveCaseId(id);
    setActiveTab('trace');
  }, []);

  const generateAlgorithmicTrace = useCallback((searchVal, reasonMessage = null) => {
    const res = createAlgorithmicTraceCase(searchVal, scenarios);
    setScenarios(res.scenarios);
    setActiveCaseId(res.newCaseId);
    setActiveTab('trace');
    if (reasonMessage) {
      showToast(`Mainnet Note: ${reasonMessage}. Generated algorithmic trace model.`, "warning");
    } else {
      showToast(`Generated algorithmic trace for query: ${searchVal.slice(0, 12)}...`, "info");
    }
  }, [scenarios, showToast]);

  const handleSearch = useCallback(async (searchVal) => {
    const trimmed = searchVal.trim();
    if (!trimmed) return;

    setIsLoadingLive(true);
    setActiveTab('trace');

    try {
      if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
        showToast("Tracing Tx outspends on Bitcoin mainnet...", "info", 2500);
        const formatted = await traceEndReceiver(trimmed, 2);
        const res = createLiveTxCase(trimmed, formatted, scenarios);
        setScenarios(res.scenarios);
        setActiveCaseId(res.newCaseId);
        setLiveMode(true);
        showToast("Mainnet transaction trace completed!", "success");
      } 
      else if (trimmed.startsWith('bc1') || trimmed.startsWith('1') || trimmed.startsWith('3')) {
        showToast("Querying address history on Bitcoin mainnet...", "info", 2500);
        const txs = await fetchAddressTxs(trimmed);
        if (txs && txs.length > 0) {
          const latestTx = txs[0];
          const formatted = await traceEndReceiver(latestTx.txid, 2);
          const res = createAddressTraceCase(trimmed, txs.length, latestTx.txid, formatted, scenarios);
          setScenarios(res.scenarios);
          setActiveCaseId(res.newCaseId);
          setLiveMode(true);
          showToast("Mainnet address trace completed!", "success");
        } else {
          generateAlgorithmicTrace(trimmed, "No outgoing transactions found on mainnet");
        }
      } else {
        generateAlgorithmicTrace(trimmed);
      }
    } catch (err) {
      console.warn("Mainnet query note:", err.message);
      generateAlgorithmicTrace(trimmed, err.message);
    } finally {
      setIsLoadingLive(false);
    }
  }, [scenarios, generateAlgorithmicTrace, showToast]);

  const handleExpandAddress = useCallback(async (address) => {
    setIsLoadingLive(true);
    try {
      showToast(`Fetching outgoing transactions for ${address.slice(0, 8)}...`, "info", 2500);
      const txs = await fetchAddressTxs(address);
      if (!txs || txs.length === 0) {
        showToast("No outgoing transactions found for this address on Bitcoin Mainnet.", "warning");
        return;
      }

      const firstTx = txs[0];
      const formatted = formatBlockstreamTx(firstTx);

      const existingNodes = [...activeCase.nodes];
      const existingLinks = [...activeCase.links];

      const newTxNodeId = `tx_${firstTx.txid}`;

      existingLinks.push({
        source: `out_${address}`,
        target: newTxNodeId,
        value: `${((firstTx.vout[0]?.value || 0) / 100000000).toFixed(4)} BTC`,
        timestamp: 'On-chain'
      });

      formatted.nodes.forEach(node => {
        if (!existingNodes.some(n => n.id === node.id)) {
          existingNodes.push(node);
        }
      });
      formatted.links.forEach(link => {
        if (!existingLinks.some(l => l.source === link.source && l.target === link.target)) {
          existingLinks.push(link);
        }
      });

      const updatedCase = {
        ...activeCase,
        nodes: existingNodes,
        links: existingLinks
      };

      setScenarios(scenarios.map(s => s.id === activeCase.id ? updatedCase : s));
      showToast("Expanded address hops successfully!", "success");
    } catch (err) {
      showToast(`Error expanding address: ${err.message}`, "error");
    } finally {
      setIsLoadingLive(false);
    }
  }, [activeCase, scenarios, showToast]);

  const value = {
    scenarios,
    activeCaseId,
    activeCase,
    activeTab,
    liveMode,
    isLoadingLive,
    setActiveTab,
    setLiveMode,
    handleExportCase,
    handleImportCase,
    handleResetCases,
    handleSelectCase,
    handleSearch,
    handleExpandAddress
  };

  return (
    <CaseContext.Provider value={value}>
      {children}
    </CaseContext.Provider>
  );
}
