import React, { useState } from 'react';
import {
  Globe,
  FileSignature,
  Clipboard,
  AlertTriangle,
  Download,
  Mail,
  Building2,
  Clock,
  ShieldCheck,
  FileCode,
  ExternalLink
} from 'lucide-react';
import { useCase } from '../hooks/useCase';
import { useToast } from '../hooks/useToast';
import { decodeScriptPubkey } from '../utils/scriptDecoder';
import { downloadText } from '../utils/download';
import { getExplorerUrls } from '../utils/knownEntities';
import { 
  EXCHANGES, 
  EXCHANGE_DIRECTORY,
  DEFAULT_FIR_NUMBER, 
  DEFAULT_OFFICER_TITLE, 
  ZONAL_UNITS, 
  generateSection67NoticeText,
  generateComplianceEmailTemplate
} from '../constants/legalConstants';

export default function OSINTIntegrator() {
  const { activeCase } = useCase();
  const { showToast } = useToast();

  const [selectedExchange, setSelectedExchange] = useState(EXCHANGES[0]);
  const [firNumber, setFirNumber] = useState(DEFAULT_FIR_NUMBER);
  const [zonalUnit, setZonalUnit] = useState(ZONAL_UNITS[0].value);
  const [officerRank, setOfficerRank] = useState(DEFAULT_OFFICER_TITLE);
  const [officerBadge, setOfficerBadge] = useState('NCB-84920-LE');

  // Script Inspector state
  const [scriptInput, setScriptInput] = useState('');
  const [decodedScript, setDecodedScript] = useState(null);

  if (!activeCase) return <div style={{ color: 'var(--text-secondary)' }}>Select a case first.</div>;

  const receiverNode = activeCase.nodes.find(n => n.type === 'receiver');
  const suspectNode = activeCase.nodes.find(n => n.type === 'suspect');
  const exchangeInfo = EXCHANGE_DIRECTORY[selectedExchange] || {
    entity: 'Exchange Compliance Liaison',
    email: 'compliance@exchange.com',
    sla: '48 Hours',
    jurisdiction: 'Standard Compliance'
  };

  const handleInspectScript = (inputVal) => {
    const val = inputVal !== undefined ? inputVal : scriptInput;
    if (!val || !val.trim()) {
      showToast("Enter an address or code to decode.", "warning");
      return;
    }
    const res = decodeScriptPubkey(val.trim());
    setDecodedScript(res);
    showToast("Decoded.", "info");
  };

  const endpointRows = [
    suspectNode && { role: 'Origin', node: suspectNode },
    receiverNode && { role: 'Endpoint', node: receiverNode },
  ].filter(Boolean);

  const getSubpoenaText = () => {
    if (!receiverNode) return "";
    return generateSection67NoticeText({
      zonalUnit,
      firNumber,
      selectedExchange,
      caseTitle: activeCase.title,
      depositAddress: receiverNode.details?.address || receiverNode.id || 'N/A',
      currency: activeCase.currency,
      balance: receiverNode.balance || '0 BTC',
      officerRank: `${officerRank} [Badge: ${officerBadge}]`,
      sigKey: undefined
    });
  };

  const handleCopySubpoena = () => {
    const text = getSubpoenaText();
    if (!text) {
      showToast("No end receiver for a notice yet.", "warning");
      return;
    }
    navigator.clipboard.writeText(text);
    showToast("Notice copied.", "success");
  };

  const handleDownloadSubpoena = () => {
    const text = getSubpoenaText();
    if (!text) {
      showToast("No end receiver for a notice yet.", "warning");
      return;
    }
    downloadText(text, `NCB-Section67-Notice-${activeCase.id.toUpperCase()}.txt`);
    showToast("Notice downloaded.", "success");
  };

  const handleSendEmail = () => {
    if (!receiverNode) {
      showToast("No end receiver in this case.", "warning");
      return;
    }
    const mailto = generateComplianceEmailTemplate({
      selectedExchange,
      firNumber,
      depositAddress: receiverNode.details?.address || receiverNode.id || 'N/A',
      balance: receiverNode.balance || '0 BTC',
      officerRank: `${officerRank} [Badge: ${officerBadge}]`
    });
    window.open(mailto, '_blank');
    showToast("Opened email draft.", "info");
  };

  return (
    <div className="responsive-split-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', minHeight: '500px' }}>
      
      {/* Notice panel */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Globe style={{ color: 'var(--primary)' }} /> Attribution & notice
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Endpoint context from the active case, and the exchange notice.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
            Case endpoints
          </h4>
          {endpointRows.length === 0 ? (
            <div style={{ backgroundColor: 'rgba(5, 8, 16, 0.4)', padding: '1rem', borderRadius: '6px', border: '1px dashed var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              No origin or endpoint nodes in the active case yet.
            </div>
          ) : (
            endpointRows.map(({ role, node }) => {
              const explorer = getExplorerUrls(node.details?.address || node.id);
              return (
                <div key={node.id} style={{ backgroundColor: 'rgba(5, 8, 16, 0.8)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{role}:</span>
                    <strong style={{ color: '#fff' }}>{node.entityName || node.label}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="mono-addr" style={{ color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={node.details?.address || node.id}>
                      {node.details?.address || node.id}
                    </span>
                    {explorer && (
                      <a href={explorer.mempool} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-label={`Open ${role} in explorer`}>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Balance:</span>
                    <span>{node.balance || 'N/A'}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Script & Public Key Disassembler Card */}
        <div style={{ backgroundColor: 'rgba(5, 8, 16, 0.7)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fff' }}>
              <FileCode size={14} style={{ color: 'var(--primary)' }} /> Script reader
            </span>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              {receiverNode && (
                <button
                  onClick={() => { setScriptInput(receiverNode.details.address); handleInspectScript(receiverNode.details.address); }}
                  className="btn btn-outline"
                  style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}
                >
                  End address
                </button>
              )}
              {suspectNode && (
                <button
                  onClick={() => { setScriptInput(suspectNode.details.address); handleInspectScript(suspectNode.details.address); }}
                  className="btn btn-outline"
                  style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}
                >
                  Start address
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              type="text"
              placeholder="Paste an address, public key, or embedded data..."
              value={scriptInput}
              onChange={(e) => setScriptInput(e.target.value)}
              className="input-field"
              style={{ flex: 1, fontSize: '0.775rem' }}
            />
            <button
              onClick={() => handleInspectScript()}
              className="btn btn-primary"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
            >
              Decode
            </button>
          </div>

          {decodedScript && (
            <div style={{ backgroundColor: '#020617', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Type:</span>
                <strong style={{ color: 'var(--primary)' }}>{decodedScript.type}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Standard:</span>
                <span>{decodedScript.standard}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Version:</span>
                <span>{decodedScript.witnessVersion ?? 'N/A'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.15rem' }}>Code:</span>
                <code className="mono-addr" style={{ fontSize: '0.7rem', color: '#38bdf8', display: 'block', backgroundColor: 'rgba(255,255,255,0.04)', padding: '0.25rem 0.4rem', borderRadius: '4px', wordBreak: 'break-all' }}>
                  {decodedScript.asm}
                </code>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                {decodedScript.securityRating}
              </div>
            </div>
          )}
        </div>

        {/* Target Exchange Compliance Directory Card */}
        <div style={{ backgroundColor: 'rgba(14, 165, 233, 0.05)', border: '1px solid rgba(14, 165, 233, 0.2)', borderRadius: '8px', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Building2 size={13} /> Exchange contact
            </span>
            <span className="badge-pill badge-pill-info" style={{ fontSize: '0.65rem' }}>
              <ShieldCheck size={11} /> {exchangeInfo.jurisdiction}
            </span>
          </div>

          <div style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 600 }}>{exchangeInfo.entity}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <span>Email: <strong className="mono-addr" style={{ color: 'var(--primary)' }}>{exchangeInfo.email}</strong></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Clock size={11} /> Usually replies: {exchangeInfo.sla}</span>
          </div>
        </div>

        {/* Section 67 NDPS Notice Parameters */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FileSignature size={16} style={{ color: '#eab308' }} /> Notice details (Section 67 NDPS Act)
          </h4>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Exchange:</label>
            <select
              value={selectedExchange}
              onChange={(e) => setSelectedExchange(e.target.value)}
              className="select-field"
              style={{ width: '100%' }}
            >
              {EXCHANGES.map((ex, idx) => (
                <option key={idx} value={ex}>{ex}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Case number (FIR):</label>
              <input
                type="text"
                value={firNumber}
                onChange={(e) => setFirNumber(e.target.value)}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Unit:</label>
              <select
                value={zonalUnit}
                onChange={(e) => setZonalUnit(e.target.value)}
                className="select-field"
                style={{ width: '100%' }}
              >
                {ZONAL_UNITS.map((zu, idx) => (
                  <option key={idx} value={zu.value}>{zu.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Officer rank:</label>
              <input
                type="text"
                value={officerRank}
                onChange={(e) => setOfficerRank(e.target.value)}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Badge:</label>
              <input
                type="text"
                value={officerBadge}
                onChange={(e) => setOfficerBadge(e.target.value)}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Subpoena Preview Panel */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FileSignature style={{ color: '#eab308' }} size={18} /> Notice preview
            </h3>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleSendEmail}
              className="btn btn-outline"
              title="Launch Compliance Email Dispatch"
            >
              <Mail size={13} /> Email Notice
            </button>
            <button
              onClick={handleCopySubpoena}
              className="btn"
            >
              <Clipboard size={14} /> Copy
            </button>
            <button
              onClick={handleDownloadSubpoena}
              className="btn btn-primary"
            >
              <Download size={14} /> Download .txt
            </button>
          </div>
        </div>

        {receiverNode ? (
          <textarea
            readOnly
            value={getSubpoenaText()}
            style={{
              flex: 1,
              width: '100%',
              backgroundColor: '#050810',
              color: '#94a3b8',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.75rem',
              padding: '1rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              resize: 'none',
              lineHeight: '1.5'
            }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
            <AlertTriangle size={36} style={{ color: '#f59e0b', marginBottom: '0.75rem' }} />
            <p>No end receiver in this case yet.</p>
          </div>
        )}
      </div>

    </div>
  );
}
