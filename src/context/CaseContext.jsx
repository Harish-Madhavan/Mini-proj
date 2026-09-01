import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SCENARIOS } from '../data/scenarios';
import { traceEndReceiver, fetchAddressTxs, formatBlockstreamTx } from '../utils/bitcoinApi';
import { createLiveTxCase, createAddressTraceCase, createAlgorithmicTraceCase } from '../utils/caseHelpers';
import { useToast } from '../hooks/useToast';
import { CaseContext } from './CaseContextObject';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/storage';
import { downloadJson } from '../utils/download';

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
    // safeGetItem already parses; if string saved directly fallback to raw localStorage string
    if (typeof saved === 'string' && saved) return saved;
    try {
      const raw = localStorage.getItem('aegistrace_activeCaseId');
      return raw ? JSON.parse(raw) : SCENARIOS[0].id;
    } catch {
      return SCENARIOS[0].id;
    }
  });

  const [liveMode, setLiveMode] = useState(true);
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [traceDepth, setTraceDepth] = useState(2);

  useEffect(() => {
    safeSetItem('aegistrace_scenarios', scenarios.slice(0, MAX_SCENARIOS));
  }, [scenarios]);

  useEffect(() => {
    try {
      localStorage.setItem('aegistrace_activeCaseId', JSON.stringify(activeCaseId));
    } catch (e) {
      console.warn("Could not save activeCaseId to localStorage", e);
    }
  }, [activeCaseId]);

  const activeCase = useMemo(() => scenarios.find(s => s.id === activeCaseId) || scenarios[0] || SCENARIOS[0], [scenarios, activeCaseId]);

  const handleExportCase = useCallback(() => {
    try {
      const filename = `aegistrace-cases-export-${new Date().toISOString().slice(0, 10)}.json`;
      downloadJson(scenarios, filename);
      showToast("Case investigation data exported successfully!", "success");
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
        showToast(`Imported ${valid.length} investigation case(s) successfully!`, "success");
      } else if (isValidCaseShape(jsonObj)) {
        setScenarios(prev => [jsonObj, ...prev.filter(s => s.id !== jsonObj.id)].slice(0, MAX_SCENARIOS));
        setActiveCaseId(jsonObj.id);
        showToast(`Case "${jsonObj.title || jsonObj.id}" imported successfully!`, "success");
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
        showToast("Cannot delete the only remaining case in session.", "warning");
        return prev;
      }
      const updated = prev.filter(s => s.id !== caseIdToDelete);
      if (activeCaseId === caseIdToDelete && updated[0]) {
        setActiveCaseId(updated[0].id);
      }
      showToast("Case removed from active session.", "info");
      return updated;
    });
  }, [activeCaseId, showToast]);

  const handleCreateCustomCase = useCallback((newCaseData) => {
    const caseId = `case-custom-${Date.now().toString(36)}`;
    const suspectAddr = newCaseData.suspectAddress || 'bc1q999customtargetaddressforensicset';
    const amount = newCaseData.amount || '5.5000 BTC';
    const receiverAddr = newCaseData.receiverAddress || 'bc1qdepositaddressforensictarget999';

    const customCase = {
      id: caseId,
      title: newCaseData.title || `Custom Case ${caseId.slice(-6).toUpperCase()}`,
      currency: "BTC",
      initialTxHash: newCaseData.txHash || "custom_tx_hash_placeholder",
      suspectName: newCaseData.suspectName || "Custom Target Entity",
      description: newCaseData.description || "Manually assembled forensic investigation case.",
      riskScore: newCaseData.riskScore || 85,
      nodes: [
        {
          id: "custom_suspect",
          label: "Origin Input",
          type: "suspect",
          entityName: newCaseData.suspectName || "Target Suspect",
          balance: amount,
          risk: "critical",
          details: {
            address: suspectAddr,
            ipLog: "103.241.12.89 (P2P Broadcast)",
            lastActive: "Recent On-Chain Activity",
            kycStatus: "UNREGISTERED NON-KYC",
            scriptStandard: "Native SegWit (v0 P2WPKH)",
            riskReason: "Originating wallet identified in initial intelligence dossier."
          }
        },
        {
          id: "custom_hop_1",
          label: "Layering Hop 1",
          type: "hop",
          entityName: "Transit Peeling Node",
          balance: amount,
          risk: "medium",
          details: {
            address: `bc1qhop${Date.now().toString(36)}transithopaddr`,
            ipLog: "P2P Relay Peer",
            lastActive: "Structured Routing",
            kycStatus: "UNLINKED UTXO",
            scriptStandard: "SegWit Script",
            riskReason: "Peeling chain change address for value obfuscation."
          }
        },
        {
          id: "custom_receiver",
          label: "Exchange Terminal",
          type: "receiver",
          entityName: newCaseData.targetExchange || "WazirX India Deposit Point",
          balance: amount,
          risk: "low",
          details: {
            address: receiverAddr,
            ipLog: "122.161.49.5 (Gateway Login)",
            lastActive: "Active Deposit Point",
            kycStatus: "SUBPOENA READY (KYC ON FILE)",
            ownerName: "Attributed User Record",
            kycDocumentId: "NCB-SUBPOENA-REF",
            scriptStandard: "Pay-to-Script-Hash",
            riskReason: "Terminal deposit endpoint resolving to FIU-registered exchange KYC."
          }
        }
      ],
      links: [
        {
          source: "custom_suspect",
          target: "custom_hop_1",
          value: amount,
          timestamp: "Block Confirmed"
        },
        {
          source: "custom_hop_1",
          target: "custom_receiver",
          value: amount,
          timestamp: "Settlement Confirmed"
        }
      ]
    };

    setScenarios(prev => [customCase, ...prev]);
    setActiveCaseId(caseId);
    setActiveTab('trace');
    showToast(`Created investigation case "${customCase.title}"`, "success");
  }, [setActiveTab, showToast]);

  const handleResetCases = useCallback(() => {
    if (window.confirm("Reset all investigation traces to default state?")) {
      setScenarios(SCENARIOS);
      setActiveCaseId(SCENARIOS[0].id);
      safeRemoveItem('aegistrace_scenarios');
      safeRemoveItem('aegistrace_activeCaseId');
      try { localStorage.removeItem('aegistrace_activeCaseId'); } catch { /* ignore */ }
      showToast("Reset all investigation traces to defaults.", "info");
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
      showToast(`Mainnet Note: ${reasonMessage}. Generated algorithmic trace model.`, "warning");
    } else {
      showToast(`Generated algorithmic trace for query: ${searchVal.slice(0, 12)}...`, "info");
    }
  }, [setActiveTab, showToast]);

  const handleSearch = useCallback(async (searchVal) => {
    const trimmed = searchVal.trim();
    if (!trimmed) return;

    setIsLoadingLive(true);
    setActiveTab('trace');

    try {
      if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
        showToast(`Tracing Tx outspends on Bitcoin mainnet (depth: ${traceDepth})...`, "info", 2500);
        const formatted = await traceEndReceiver(trimmed, traceDepth);
        setScenarios(prev => {
          const res = createLiveTxCase(trimmed, formatted, prev);
          queueMicrotask(() => setActiveCaseId(res.newCaseId));
          return res.scenarios.slice(0, MAX_SCENARIOS);
        });
        setLiveMode(true);
        showToast("Mainnet transaction trace completed!", "success");
      } 
      else if (trimmed.startsWith('bc1') || trimmed.startsWith('1') || trimmed.startsWith('3')) {
        showToast("Querying address history on Bitcoin mainnet...", "info", 2500);
        const txs = await fetchAddressTxs(trimmed);
        if (txs && txs.length > 0) {
          const latestTx = txs[0];
          const formatted = await traceEndReceiver(latestTx.txid, traceDepth);
          setScenarios(prev => {
            const res = createAddressTraceCase(trimmed, txs.length, latestTx.txid, formatted, prev);
            queueMicrotask(() => setActiveCaseId(res.newCaseId));
            return res.scenarios.slice(0, MAX_SCENARIOS);
          });
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
  }, [traceDepth, generateAlgorithmicTrace, setActiveTab, showToast]);

  const handleExpandAddress = useCallback(async (address) => {
    if (!address || typeof address !== 'string' || address.trim().length < 10) {
      showToast("Invalid address for expansion.", "warning");
      return;
    }
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

      setScenarios(prev => prev.map(s => {
        if (s.id !== activeCase.id) return s;
        const existingNodes = [...s.nodes];
        const existingLinks = [...s.links];
        const newTxNodeId = `tx_${firstTx.txid}`;
        const txValue = `${((firstTx.vout[0]?.value || 0) / 100000000).toFixed(4)} BTC`;
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
      showToast("Expanded address hops successfully!", "success");
    } catch (err) {
      showToast(`Error expanding address: ${err.message}`, "error");
    } finally {
      setIsLoadingLive(false);
    }
  }, [activeCase?.id, showToast]);

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
    showToast("Added field note to active case log.", "success");
  }, [activeCase?.id, showToast]);

  const handleDeleteCaseNote = useCallback((noteId) => {
    setScenarios(prev => prev.map(s => s.id === activeCase.id ? { ...s, notesList: (s.notesList || []).filter(n => n.id !== noteId) } : s));
    showToast("Removed field note.", "info");
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
