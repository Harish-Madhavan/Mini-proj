import React, { useState } from 'react';
import {
  Clipboard,
  Download,
  Mail,
  ExternalLink
} from 'lucide-react';
import { useCase } from '../hooks/useCase';
import { useToast } from '../hooks/useToast';
import { decodeScriptPubkey } from '../utils/scriptDecoder';
import { downloadText } from '../utils/download';
import { getExplorerUrls } from '../utils/knownEntities';
import { parseCrossChainMemo } from '../utils/crossChainForensics';
import { 
  EXCHANGES, 
  EXCHANGE_DIRECTORY,
  DEFAULT_FIR_NUMBER, 
  DEFAULT_OFFICER_TITLE, 
  ZONAL_UNITS, 
  generateSection67NoticeText,
  generateComplianceEmailTemplate
} from '../constants/legalConstants';

function EndpointRow({ role, node }) {
  const explorer = getExplorerUrls(node.details?.address || node.id);
  return (
    <div style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--border-soft)', fontSize: '0.83rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{role}</span>
        <strong style={{ fontWeight: 600 }}>{node.entityName || node.label}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem' }}>
        <span className="mono-addr" style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={node.details?.address || node.id}>
          {node.details?.address || node.id}
        </span>
        {explorer && (
          <a href={explorer.mempool} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-label={`Open ${role} in explorer`}>
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

export default function OSINTIntegrator() {
  const { activeCase } = useCase();
  const { showToast } = useToast();

  const [noticeForm, setNoticeForm] = useState({
    selectedExchange: EXCHANGES[0],
    firNumber: DEFAULT_FIR_NUMBER,
    zonalUnit: ZONAL_UNITS[0].value,
    officerRank: DEFAULT_OFFICER_TITLE,
    officerBadge: 'NCB-84920-LE'
  });
  const updateNotice = (key, val) => setNoticeForm(prev => ({ ...prev, [key]: val }));

  // Script Inspector state
  const [scriptInput, setScriptInput] = useState('');
  const [decodedScript, setDecodedScript] = useState(null);
  const [crossChainMatch, setCrossChainMatch] = useState(null);

  if (!activeCase) return <div style={{ color: 'var(--text-secondary)' }}>Select a case first.</div>;

  const receiverNode = activeCase.nodes.find(n => n.type === 'receiver');
  const suspectNode = activeCase.nodes.find(n => n.type === 'suspect');
  const exchangeInfo = EXCHANGE_DIRECTORY[noticeForm.selectedExchange] || {
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
    const trimmed = val.trim();
    const res = decodeScriptPubkey(trimmed);
    const cc = parseCrossChainMemo(trimmed) || (res?.asm ? parseCrossChainMemo(res.asm) : null);
    setDecodedScript(res);
    setCrossChainMatch(cc);
    showToast(cc ? "Cross-chain memo detected!" : "Decoded.", "info");
  };

  const endpointRows = [
    suspectNode && { role: 'Origin', node: suspectNode },
    receiverNode && { role: 'Endpoint', node: receiverNode },
  ].filter(Boolean);

  const getSubpoenaText = () => {
    if (!receiverNode) return "";
    return generateSection67NoticeText({
      zonalUnit: noticeForm.zonalUnit,
      firNumber: noticeForm.firNumber,
      selectedExchange: noticeForm.selectedExchange,
      caseTitle: activeCase.title,
      depositAddress: receiverNode.details?.address || receiverNode.id || 'N/A',
      currency: activeCase.currency,
      balance: receiverNode.balance || '0 BTC',
      officerRank: `${noticeForm.officerRank} [Badge: ${noticeForm.officerBadge}]`,
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
      selectedExchange: noticeForm.selectedExchange,
      firNumber: noticeForm.firNumber,
      depositAddress: receiverNode.details?.address || receiverNode.id || 'N/A',
      balance: receiverNode.balance || '0 BTC',
      officerRank: `${noticeForm.officerRank} [Badge: ${noticeForm.officerBadge}]`
    });
    window.open(mailto, '_blank');
    showToast("Opened email draft.", "info");
  };

  return (
    <div className="responsive-split-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
      
      {/* Notice panel */}
      <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
            Attribution & notice
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.2rem' }}>Endpoint context and the exchange notice.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)', paddingBottom: '0.25rem' }}>
            Case endpoints
          </h4>
          {endpointRows.length === 0 ? (
            <div style={{ padding: '0.75rem 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              No origin or endpoint nodes yet.
            </div>
          ) : (
            endpointRows.map(({ role, node }) => (
              <EndpointRow key={node.id} role={role} node={node} />
            ))
          )}
        </div>

        {/* Script & Public Key Disassembler Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              Script reader
            </span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {receiverNode && (
                <button
                  onClick={() => { setScriptInput(receiverNode.details.address); handleInspectScript(receiverNode.details.address); }}
                  className="btn-quiet"
                  style={{ fontSize: '0.76rem' }}
                >
                  End
                </button>
              )}
              {suspectNode && (
                <button
                  onClick={() => { setScriptInput(suspectNode.details.address); handleInspectScript(suspectNode.details.address); }}
                  className="btn-quiet"
                  style={{ fontSize: '0.76rem' }}
                >
                  Start
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              type="text"
              placeholder="Address or script..."
              value={scriptInput}
              onChange={(e) => setScriptInput(e.target.value)}
              className="input-field"
              style={{ flex: 1, fontSize: '0.82rem' }}
            />
            <button
              onClick={() => handleInspectScript()}
              className="btn btn-primary"
              style={{ fontSize: '0.8rem' }}
            >
              Decode
            </button>
          </div>

          {decodedScript && (
            <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.25rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Type</span>
                <strong>{decodedScript.type}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Standard</span>
                <span>{decodedScript.standard}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.15rem', fontSize: '0.76rem' }}>Code</span>
                <code className="mono-addr" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', display: 'block', wordBreak: 'break-all' }}>
                  {decodedScript.asm}
                </code>
              </div>
            </div>
          )}

          {crossChainMatch && (
            <div style={{ padding: '0.6rem 0', borderTop: '1px solid var(--border-soft)', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong>{crossChainMatch.protocol}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>{crossChainMatch.destinationChain} ({crossChainMatch.targetAsset})</span>
              </div>
              {crossChainMatch.destinationAddress && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem', marginTop: '0.1rem' }}>
                  <span className="mono-addr" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{crossChainMatch.destinationAddress}</span>
                  <button onClick={() => { navigator.clipboard.writeText(crossChainMatch.destinationAddress); showToast("Destination address copied.", "success"); }} className="btn-quiet" style={{ fontSize: '0.76rem' }}>Copy</button>
                </div>
              )}
              {crossChainMatch.explorerUrl && (
                <a href={crossChainMatch.explorerUrl} target="_blank" rel="noopener noreferrer" className="btn-quiet" style={{ fontSize: '0.78rem', marginTop: '0.2rem', textDecoration: 'none' }}>
                  <ExternalLink size={12} /> Open explorer
                </a>
              )}
            </div>
          )}
        </div>

        {/* Target Exchange Compliance Directory Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-soft)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Exchange contact
          </span>

          <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>{exchangeInfo.entity}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span className="mono-addr">{exchangeInfo.email}</span>
            <span>Replies: {exchangeInfo.sla}</span>
          </div>
        </div>

        {/* Section 67 NDPS Notice Parameters */}
        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h4 style={{ fontSize: '0.82rem', fontWeight: 600 }}>
            Notice details
          </h4>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Exchange:</label>
            <select
              value={noticeForm.selectedExchange}
              onChange={(e) => updateNotice('selectedExchange', e.target.value)}
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
                value={noticeForm.firNumber}
                onChange={(e) => updateNotice('firNumber', e.target.value)}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Unit:</label>
              <select
                value={noticeForm.zonalUnit}
                onChange={(e) => updateNotice('zonalUnit', e.target.value)}
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
                value={noticeForm.officerRank}
                onChange={(e) => updateNotice('officerRank', e.target.value)}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Badge:</label>
              <input
                type="text"
                value={noticeForm.officerBadge}
                onChange={(e) => updateNotice('officerBadge', e.target.value)}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Subpoena Preview Panel */}
      <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
            Notice preview
          </h3>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleSendEmail}
              className="btn-quiet"
              style={{ fontSize: '0.8rem' }}
              title="Launch Compliance Email Dispatch"
            >
              <Mail size={13} /> Email
            </button>
            <button
              onClick={handleCopySubpoena}
              className="btn-quiet"
              style={{ fontSize: '0.8rem' }}
            >
              <Clipboard size={13} /> Copy
            </button>
            <button
              onClick={handleDownloadSubpoena}
              className="btn btn-primary"
              style={{ fontSize: '0.8rem' }}
            >
              <Download size={13} /> .txt
            </button>
          </div>
        </div>

        {receiverNode ? (
          <textarea
            readOnly
            value={getSubpoenaText()}
            rows={22}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              fontFamily: 'ui-monospace, monospace',
              fontSize: '0.78rem',
              padding: '0',
              border: 'none',
              resize: 'none',
              lineHeight: '1.6',
              outline: 'none'
            }}
          />
        ) : (
          <div style={{ padding: '1rem 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
            No end receiver in this case yet.
          </div>
        )}
      </div>

    </div>
  );
}
