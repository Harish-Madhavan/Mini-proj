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
  ZONAL_UNITS, 
  REQUEST_TYPES,
  getRequestDraftReadiness,
  generateRequestWorksheetText,
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
    recipientEntity: EXCHANGE_DIRECTORY[EXCHANGES[0]].entity,
    recipientEmail: '',
    contactVerified: false,
    contactSourceReference: '',
    contactVerifiedAt: '',
    firNumber: '',
    zonalUnit: ZONAL_UNITS[0].value,
    officerRank: '',
    officerBadge: '',
    requestType: REQUEST_TYPES.PRESERVATION,
    recordsScope: '',
    periodStart: '',
    periodEnd: '',
    legalBasisReference: ''
  });
  const updateNotice = (key, val) => setNoticeForm(prev => ({ ...prev, [key]: val }));
  const [selectedEndpointId, setSelectedEndpointId] = useState('');

  // Script Inspector state
  const [scriptInput, setScriptInput] = useState('');
  const [decodedScript, setDecodedScript] = useState(null);
  const [crossChainMatch, setCrossChainMatch] = useState(null);

  if (!activeCase) return <div style={{ color: 'var(--text-secondary)' }}>Select a case first.</div>;

  const receiverNodes = activeCase.nodes.filter(n => n.type === 'receiver');
  const receiverNode = receiverNodes.find(n => n.id === selectedEndpointId) || receiverNodes[0] || null;
  const suspectNode = activeCase.nodes.find(n => n.type === 'suspect');
  const endpointAddress = receiverNode?.details?.address || receiverNode?.id || '';
  const endpointEvidence = receiverNode
    ? (activeCase.links || [])
      .filter(link => (typeof link.target === 'object' ? link.target.id : link.target) === receiverNode.id)
      .map(link => {
        const txid = link.txid || link.transactionId || link.details?.txid;
        const outputIndex = Number.isInteger(link.outputIndex) ? ` output ${link.outputIndex}` : '';
        return txid ? `${txid}${outputIndex}${link.value ? ` (${link.value})` : ''}` : null;
      })
      .filter(Boolean)
    : [];
  const requestReadiness = getRequestDraftReadiness({
    recipientEntity: noticeForm.recipientEntity,
    endpointAddress,
    requestType: noticeForm.requestType,
    recordsScope: noticeForm.recordsScope,
    periodStart: noticeForm.periodStart,
    periodEnd: noticeForm.periodEnd,
    legalBasisReference: noticeForm.legalBasisReference,
    recipientEmail: noticeForm.recipientEmail,
    contactVerified: noticeForm.contactVerified,
    contactSourceReference: noticeForm.contactSourceReference,
    contactVerifiedAt: noticeForm.contactVerifiedAt
  });

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

  const getWorksheetText = () => {
    if (!receiverNode) return "";
    return generateRequestWorksheetText({
      requestType: noticeForm.requestType,
      zonalUnit: noticeForm.zonalUnit,
      firNumber: noticeForm.firNumber,
      selectedExchange: noticeForm.recipientEntity,
      recipientEmail: noticeForm.recipientEmail,
      caseTitle: activeCase.title,
      endpointAddress,
      currency: activeCase.currency,
      balance: receiverNode.balance || '0 BTC',
      legalBasisReference: noticeForm.legalBasisReference,
      recordsScope: noticeForm.recordsScope,
      periodStart: noticeForm.periodStart,
      periodEnd: noticeForm.periodEnd,
      contactSourceReference: noticeForm.contactSourceReference,
      contactVerifiedAt: noticeForm.contactVerified ? noticeForm.contactVerifiedAt : '',
      evidenceReferences: endpointEvidence,
      officerRank: [noticeForm.officerRank, noticeForm.officerBadge].filter(Boolean).join(' / '),
    });
  };

  const handleCopyWorksheet = async () => {
    const text = getWorksheetText();
    if (!text) {
      showToast("Select a case endpoint before creating a worksheet.", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Draft worksheet copied.", "success");
    } catch (error) {
      console.warn('Could not copy request worksheet:', error);
      showToast("Clipboard access failed. Download the worksheet instead.", "error");
    }
  };

  const handleDownloadWorksheet = () => {
    const text = getWorksheetText();
    if (!text) {
      showToast("Select a case endpoint before creating a worksheet.", "warning");
      return;
    }
    downloadText(text, `request-worksheet-${activeCase.id}.txt`);
    showToast("Draft worksheet downloaded.", "success");
  };

  const handleSendEmail = () => {
    if (!requestReadiness.readyForEmailDraft) {
      showToast([...requestReadiness.missing, ...requestReadiness.emailMissing].join(' '), "warning");
      return;
    }
    const mailto = generateComplianceEmailTemplate({
      recipientEmail: noticeForm.recipientEmail,
      selectedExchange: noticeForm.recipientEntity,
      firNumber: noticeForm.firNumber,
      depositAddress: endpointAddress,
      requestType: noticeForm.requestType,
      recordsScope: noticeForm.recordsScope,
      periodStart: noticeForm.periodStart,
      periodEnd: noticeForm.periodEnd,
      legalBasisReference: noticeForm.legalBasisReference,
      evidenceReferences: endpointEvidence
    });
    const composer = window.open(mailto, '_blank', 'noopener');
    showToast(composer
      ? "Email composer opened. Review the recipient and draft before sending."
      : "Email composer was blocked. Download the worksheet instead.", composer ? "info" : "warning");
  };

  return (
      <div className="responsive-split-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
      
      {/* Notice panel */}
      <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
            Request preparation worksheet
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.2rem' }}>Inspect endpoint evidence and prepare an unapproved draft for authorized review.</p>
        </div>

        <div role="note" style={{ padding: '0.7rem', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
          Internal worksheet only. It cannot issue or serve a subpoena, statutory notice, preservation demand, or records request. A trace does not establish address ownership, current funds, or legal authority. Verify facts, recipient contacts, and applicable process independently.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)', paddingBottom: '0.25rem' }}>
            Case endpoints and trace context
          </h4>
          {receiverNodes.length > 1 && (
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
              Endpoint under review
              <select
                aria-label="Endpoint under review"
                value={receiverNode?.id || ''}
                onChange={event => setSelectedEndpointId(event.target.value)}
                className="select-field"
                style={{ width: '100%', display: 'block', marginTop: '0.25rem' }}
              >
                {receiverNodes.map(node => (
                  <option key={node.id} value={node.id}>
                    {node.entityName || node.label} — {node.details?.address || node.id}
                  </option>
                ))}
              </select>
            </label>
          )}
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
                  onClick={() => { setScriptInput(endpointAddress); handleInspectScript(endpointAddress); }}
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

        {/* Recipient/contact details are investigator-entered; the static entity directory does not verify service channels. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-soft)' }}>
          <strong style={{ fontSize: '0.82rem' }}>Proposed recipient and contact review</strong>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.73rem' }}>
            Directory entries are suggestions only. No email address or service channel is verified by this application.
          </p>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Entity / organization
            <input
              aria-label="Recipient entity"
              type="text"
              value={noticeForm.recipientEntity}
              onChange={event => updateNotice('recipientEntity', event.target.value)}
              className="input-field"
              style={{ width: '100%', marginTop: '0.2rem' }}
            />
          </label>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Recipient address (enter only after independent verification)
            <input
              aria-label="Recipient email"
              type="email"
              value={noticeForm.recipientEmail}
              onChange={event => updateNotice('recipientEmail', event.target.value)}
              className="input-field"
              style={{ width: '100%', marginTop: '0.2rem' }}
              placeholder="Official service channel"
            />
          </label>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Verification source / reference
            <input
              aria-label="Contact verification source"
              type="text"
              value={noticeForm.contactSourceReference}
              onChange={event => updateNotice('contactSourceReference', event.target.value)}
              className="input-field"
              style={{ width: '100%', marginTop: '0.2rem' }}
              placeholder="Official directory URL or reviewed reference"
            />
          </label>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Contact checked on
            <input
              aria-label="Contact verification date"
              type="date"
              value={noticeForm.contactVerifiedAt}
              onChange={event => updateNotice('contactVerifiedAt', event.target.value)}
              className="input-field"
              style={{ width: '100%', marginTop: '0.2rem' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
            <input
              type="checkbox"
              checked={noticeForm.contactVerified}
              onChange={event => updateNotice('contactVerified', event.target.checked)}
            />
            I independently verified the selected contact channel for this request.
          </label>
        </div>

        {/* Request worksheet details; statutory authority is supplied only after review. */}
        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h4 style={{ fontSize: '0.82rem', fontWeight: 600 }}>
            Draft details
          </h4>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Suggested entity:</label>
            <select
              value={noticeForm.selectedExchange}
            onChange={(e) => setNoticeForm(prev => ({
              ...prev,
              selectedExchange: e.target.value,
              recipientEntity: EXCHANGE_DIRECTORY[e.target.value]?.entity || e.target.value
            }))}
              className="select-field"
              style={{ width: '100%' }}
            >
              {EXCHANGES.map((ex, idx) => (
                <option key={idx} value={ex}>{ex}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
              Intended request type
            </label>
            <select
              aria-label="Intended request type"
              value={noticeForm.requestType}
              onChange={event => updateNotice('requestType', event.target.value)}
              className="select-field"
              style={{ width: '100%' }}
            >
              <option value={REQUEST_TYPES.PRESERVATION}>Preservation request only</option>
              <option value={REQUEST_TYPES.DISCLOSURE}>Disclosure request (approved process required)</option>
              <option value={REQUEST_TYPES.PRESERVATION_AND_DISCLOSURE}>Preservation and disclosure (approved process required for disclosure)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
              Reviewer-approved legal process / authority reference
            </label>
            <input
              aria-label="Legal process reference"
              type="text"
              value={noticeForm.legalBasisReference}
              onChange={event => updateNotice('legalBasisReference', event.target.value)}
              className="input-field"
              style={{ width: '100%' }}
              placeholder="Record the approved instrument/reference; do not rely on a suggested template"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Records period start
              <input aria-label="Records period start" type="date" value={noticeForm.periodStart} onChange={event => updateNotice('periodStart', event.target.value)} className="input-field" style={{ width: '100%', marginTop: '0.2rem' }} />
            </label>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Records period end
              <input aria-label="Records period end" type="date" value={noticeForm.periodEnd} onChange={event => updateNotice('periodEnd', event.target.value)} className="input-field" style={{ width: '100%', marginTop: '0.2rem' }} />
            </label>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
              Records sought (reviewer-defined, specific scope)
            </label>
            <textarea
              aria-label="Records sought"
              value={noticeForm.recordsScope}
              onChange={event => updateNotice('recordsScope', event.target.value)}
              className="input-field"
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
              placeholder="Describe the specific records for legal review; avoid unnecessary data."
            />
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

      {/* Draft Preview Panel */}
      <div className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
            Draft preview
          </h3>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleSendEmail}
              className="btn-quiet"
              style={{ fontSize: '0.8rem' }}
              disabled={!requestReadiness.readyForEmailDraft}
              title={requestReadiness.readyForEmailDraft
                ? 'Open a reviewer-prepared email draft; this does not send it'
                : [...requestReadiness.missing, ...requestReadiness.emailMissing].join(' ')}
            >
              <Mail size={13} /> Email draft
            </button>
            <button
              onClick={handleCopyWorksheet}
              className="btn-quiet"
              style={{ fontSize: '0.8rem' }}
              disabled={!receiverNode}
            >
              <Clipboard size={13} /> Copy worksheet
            </button>
            <button
              onClick={handleDownloadWorksheet}
              className="btn btn-primary"
              style={{ fontSize: '0.8rem' }}
              disabled={!receiverNode}
            >
              <Download size={13} /> Download
            </button>
          </div>
        </div>

        <div role="status" style={{ padding: '0.75rem', border: `1px solid ${requestReadiness.readyForReview ? 'rgba(84,223,194,0.35)' : 'rgba(255,203,116,0.35)'}`, borderRadius: 8, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
          <strong style={{ color: requestReadiness.readyForReview ? 'var(--color-success, #54dfc2)' : 'var(--color-warning, #ffcb74)' }}>
            {requestReadiness.readyForReview ? 'Worksheet has the basic review fields' : 'Incomplete draft — review fields missing'}
          </strong>
          {requestReadiness.missing.length > 0 && (
            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
              {requestReadiness.missing.map(item => <li key={item}>{item}</li>)}
            </ul>
          )}
          {!requestReadiness.readyForEmailDraft && (
            <p style={{ margin: '0.4rem 0 0' }}>
              Email draft remains disabled until required worksheet fields and reviewer-recorded contact verification are present. This is a workflow check, not legal approval.
            </p>
          )}
        </div>

        {receiverNode ? (
          <textarea
            readOnly
            aria-label="Request worksheet preview"
            value={getWorksheetText()}
            rows={27}
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
            No receiver endpoint is recorded in this case. Add or select a trace with receiver outputs before creating a request worksheet.
          </div>
        )}
      </div>

    </div>
  );
}
