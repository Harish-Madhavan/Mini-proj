import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SCENARIOS } from '../data/scenarios';
import { traceEndReceiver, fetchAddressTxs, formatBlockstreamTx } from '../utils/bitcoinApi';
import { 
  createLiveTxCase, 
  createAddressTraceCase, 
  createAlgorithmicTraceCase, 
  createCustomInvestigationCase 
} from '../utils/caseHelpers';
import { useToast } from '../hooks/useToast';
import { CaseContext } from './CaseContextObject';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/storage';
import { downloadJson } from '../utils/download';
import { satsToBtc } from '../utils/forensicUtils';

const MAX_SCENARIOS = 50;

function isValidCaseShape(obj) {
  return obj && typeof obj.id === 'string' && Array.isArray(obj.nodes) && Array.isArray(obj.links) && obj.nodes.length > 0;
}

export function CaseProvider({ children }) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const activeTab = location.pathname.substring(1) || 'dashboard';
  const setActiveTab = useCallback((tab) => {
    const targetPath = tab.startsWith('/') ? tab : `/${tab}`;
    if (location.pathname !== targetPath) {
      navigate(targetPath);
    }
  }, [location.pathname, navigate]);

  const [scenarios, setScenarios] = useState(() => {
    const saved = safeGetItem('aegistrace_scenarios', null);
    if (Array.isArray(saved) && saved.length > 0 && saved.every(isValidCaseShape)) return saved.slice(0, MAX_SCENARIOS);
    return SCENARIOS;
  });

  const [activeCaseId, setActiveCaseId] = useState(() => {
    const saved = safeGetItem('aegistrace_activeCaseId', null);
    if (typeof saved === 'string' && saved) return saved;
    return SCENARIOS[0].id;
  });

  const [liveMode, setLiveMode] = useState(true);
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [traceDepth, setTraceDepth] = useState(2);

  useEffect(() => {
    safeSetItem('aegistrace_scenarios', scenarios.slice(0, MAX_SCENARIOS));
  }, [scenarios]);

  useEffect(() => {
    safeSetItem('aegistrace_activeCaseId', activeCaseId);
  }, [activeCaseId]);

  const activeCase = useMemo(() => scenarios.find(s => s.id === activeCaseId) || scenarios[0] || SCENARIOS[0], [scenarios, activeCaseId]);

  const handleExportCase = useCallback(() => {
    try {
      const filename = `aegistrace-cases-export-${new Date().toISOString().slice(0, 10)}.json`;
      downloadJson(scenarios, filename);
      showToast("Cases exported.", "success");
    } catch (err) {
      showToast(`Export failed: ${err.message}`, "error");
    }
  }, [scenarios, showToast]);

  const handleImportCase = useCallback((jsonObj) => {
    try {
      if (Array.isArray(jsonObj)) {
        if (jsonObj.length === 0) {
          showToast("Imported file contains no cases.", "warning");
          return;
        }
        if (jsonObj.length > MAX_SCENARIOS) {
          showToast(`Import truncated to ${MAX_SCENARIOS} cases (file had ${jsonObj.length}).`, "warning");
          jsonObj = jsonObj.slice(0, MAX_SCENARIOS);
        }
        const valid = jsonObj.filter(isValidCaseShape);
        if (valid.length === 0) {
          showToast("Invalid case file format: no valid cases found.", "error");
          return;
        }
        if (valid.length < jsonObj.length) showToast(`Skipped ${jsonObj.length - valid.length} invalid case(s).`, "warning");
        setScenarios(valid);
        setActiveCaseId(valid[0].id);
        showToast(`Imported ${valid.length} case(s).`, "success");
      } else if (isValidCaseShape(jsonObj)) {
        setScenarios(prev => [jsonObj, ...prev.filter(s => s.id !== jsonObj.id)].slice(0, MAX_SCENARIOS));
        setActiveCaseId(jsonObj.id);
        showToast(`Imported case "${jsonObj.title || jsonObj.id}".`, "success");
      } else {
        showToast("Invalid case file format: missing id/nodes/links.", "error");
      }
    } catch (err) {
      showToast(`Import error: ${err.message}`, "error");
    }
  }, [showToast]);

  const handleDeleteCase = useCallback((caseIdToDelete) => {
    setScenarios(prev => {
      if (prev.length <= 1) {
        showToast("Cannot delete the last case.", "warning");
        return prev;
      }
      const updated = prev.filter(s => s.id !== caseIdToDelete);
      if (activeCaseId === caseIdToDelete && updated[0]) {
        setActiveCaseId(updated[0].id);
      }
      showToast("Case removed.", "info");
      return updated;
    });
  }, [activeCaseId, showToast]);

  const handleCreateCustomCase = useCallback((newCaseData) => {
    const customCase = createCustomInvestigationCase(newCaseData);
    setScenarios(prev => [customCase, ...prev].slice(0, MAX_SCENARIOS));
    setActiveCaseId(customCase.id);
    setActiveTab('trace');
    showToast(`Created case "${customCase.title}"`, "success");
  }, [setActiveTab, showToast]);

  const handleResetCases = useCallback(() => {
    if (window.confirm("Reset all cases?")) {
      setScenarios(SCENARIOS);
      setActiveCaseId(SCENARIOS[0].id);
      safeRemoveItem('aegistrace_scenarios');
      safeRemoveItem('aegistrace_activeCaseId');
      showToast("Cases reset.", "info");
    }
  }, [showToast]);

  const handleSelectCase = useCallback((id) => {
    setActiveCaseId(id);
    setActiveTab('trace');
  }, [setActiveTab]);

  const generateAlgorithmicTrace = useCallback((searchVal, reasonMessage = null) => {
    setScenarios(prev => {
      const res = createAlgorithmicTraceCase(searchVal, prev);
      // Defer activeCaseId update to avoid stale closure race; queue microtask
      queueMicrotask(() => setActiveCaseId(res.newCaseId));
      return res.scenarios.slice(0, MAX_SCENARIOS);
    });
    setActiveTab('trace');
    if (reasonMessage) {
      showToast(`Note: ${reasonMessage}. Made an offline estimate.`, "warning");
    } else {
      showToast(`Made an offline estimate for: ${searchVal.slice(0, 12)}...`, "info");
    }
  }, [setActiveTab, showToast]);

  const toggleLiveMode = useCallback(() => {
    setLiveMode(prev => {
      const next = !prev;
      showToast(
        next ? "Live data on." : "Offline mode on.",
        next ? "success" : "info"
      );
      return next;
    });
  }, [showToast]);

  const handleSearch = useCallback(async (searchVal) => {
    const trimmed = searchVal.trim();
    if (!trimmed) return;

    setActiveTab('trace');

    // If in offline mode, immediately produce an offline estimate
    if (!liveMode) {
      generateAlgorithmicTrace(trimmed, "Offline mode is on");
      return;
    }

    setIsLoadingLive(true);

    try {
      if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
        showToast(`Tracing live (depth: ${traceDepth})...`, "info", 2500);
        const formatted = await traceEndReceiver(trimmed, traceDepth);
        if (!formatted.nodes?.length) {
          throw new Error(`No trace data for ${trimmed.slice(0, 12)}...`);
        }
        setScenarios(prev => {
          const res = createLiveTxCase(trimmed, formatted, prev);
          queueMicrotask(() => setActiveCaseId(res.newCaseId));
          return res.scenarios.slice(0, MAX_SCENARIOS);
        });
        showToast("Trace complete.", "success");
      } 
      else if (trimmed.startsWith('bc1') || trimmed.startsWith('1') || trimmed.startsWith('3')) {
        showToast("Looking up address history...", "info", 2500);
        const txs = await fetchAddressTxs(trimmed);
        if (txs && txs.length > 0) {
          const latestTx = txs[0];
          const formatted = await traceEndReceiver(latestTx.txid, traceDepth);
          if (!formatted.nodes?.length) {
            throw new Error(`No trace data for ${trimmed.slice(0, 12)}...`);
          }
          setScenarios(prev => {
            const res = createAddressTraceCase(trimmed, txs.length, latestTx.txid, formatted, prev);
            queueMicrotask(() => setActiveCaseId(res.newCaseId));
            return res.scenarios.slice(0, MAX_SCENARIOS);
          });
          showToast("Trace complete.", "success");
        } else {
          generateAlgorithmicTrace(trimmed, "No outgoing transactions found");
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
  }, [liveMode, traceDepth, generateAlgorithmicTrace, setActiveTab, showToast]);

  const handleExpandAddress = useCallback(async (address) => {
    if (!address || typeof address !== 'string' || address.trim().length < 10) {
      showToast("Invalid address for expansion.", "warning");
      return;
    }

    if (!liveMode) {
      showToast("Address expansion needs live data mode.", "warning");
      return;
    }

    setIsLoadingLive(true);
    try {
      showToast(`Fetching outgoing transactions for ${address.slice(0, 8)}...`, "info", 2500);
      const txs = await fetchAddressTxs(address);
      if (!txs || txs.length === 0) {
        showToast("No outgoing transactions found for this address.", "warning");
        return;
      }

      const firstTx = txs[0];
      const formatted = formatBlockstreamTx(firstTx);

      setScenarios(prev => prev.map(s => {
        if (s.id !== activeCase.id) return s;
        const existingNodes = [...s.nodes];
        const existingLinks = [...s.links];
        const newTxNodeId = `tx_${firstTx.txid}`;
        const txValue = `${satsToBtc(firstTx.vout[0]?.value || 0, 4)} BTC`;
        if (!existingLinks.some(l => l.source === `out_${address}` && l.target === newTxNodeId)) {
          existingLinks.push({ source: `out_${address}`, target: newTxNodeId, value: txValue, timestamp: 'On-chain' });
        }
        formatted.nodes.forEach(node => {
          if (!existingNodes.some(n => n.id === node.id)) existingNodes.push(node);
        });
        formatted.links.forEach(link => {
          if (!existingLinks.some(l => l.source === link.source && l.target === link.target)) existingLinks.push(link);
        });
        return { ...s, nodes: existingNodes, links: existingLinks };
      }));
      showToast("Address expanded.", "success");
    } catch (err) {
      showToast(`Error expanding address: ${err.message}`, "error");
    } finally {
      setIsLoadingLive(false);
    }
  }, [liveMode, activeCase?.id, showToast]);

  const handleAddCaseNote = useCallback((noteText, author = "Investigating Officer") => {
    if (!noteText || !noteText.trim()) return;
    const trimmed = noteText.trim().slice(0, 500);
    const newNote = {
      id: `note_${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      author: String(author).slice(0, 80),
      content: trimmed
    };
    setScenarios(prev => prev.map(s => s.id === activeCase.id ? { ...s, notesList: [newNote, ...(s.notesList || [])].slice(0, 100) } : s));
    showToast("Note added.", "success");
  }, [activeCase?.id, showToast]);

  const handleDeleteCaseNote = useCallback((noteId) => {
    setScenarios(prev => prev.map(s => s.id === activeCase.id ? { ...s, notesList: (s.notesList || []).filter(n => n.id !== noteId) } : s));
    showToast("Note removed.", "info");
  }, [activeCase?.id, showToast]);

  const value = {
    scenarios,
    activeCaseId,
    activeCase,
    activeTab,
    liveMode,
    isLoadingLive,
    traceDepth,
    setTraceDepth,
    setActiveTab,
    setLiveMode,
    toggleLiveMode,
    handleExportCase,
    handleImportCase,
    handleDeleteCase,
    handleCreateCustomCase,
    handleResetCases,
    handleSelectCase,
    handleSearch,
    handleExpandAddress,
    handleAddCaseNote,
    handleDeleteCaseNote
  };

  return (
    <CaseContext.Provider value={value}>
      {children}
    </CaseContext.Provider>
  );
}
