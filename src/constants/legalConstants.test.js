import { describe, expect, it } from 'vitest';
import {
  generateComplianceEmailTemplate,
  generateRequestWorksheetText,
  getRequestDraftReadiness,
  REQUEST_TYPES,
} from './legalConstants';

describe('request worksheet preparation', () => {
  const validRequest = {
    recipientEntity: 'Example Exchange',
    endpointAddress: 'bc1qexample',
    requestType: REQUEST_TYPES.PRESERVATION,
    recordsScope: 'Preserve account and transaction records associated with the address.',
    periodStart: '2026-01-01',
    periodEnd: '2026-02-01',
    legalBasisReference: 'Counsel-approved reference CASE-123',
    recipientEmail: 'verified@example.org',
    contactVerified: true,
    contactSourceReference: 'Official law-enforcement contact directory',
    contactVerifiedAt: '2026-10-01',
  };

  it('requires scoped request details and does not infer a verified contact', () => {
    const result = getRequestDraftReadiness({
      recipientEntity: 'Example Exchange',
      endpointAddress: 'bc1qexample',
      requestType: REQUEST_TYPES.PRESERVATION,
      recordsScope: '',
      periodStart: '',
      periodEnd: '',
      legalBasisReference: '',
      recipientEmail: 'law-enforcement@example.org',
      contactVerified: false,
      contactSourceReference: '',
      contactVerifiedAt: '',
    });

    expect(result.readyForReview).toBe(false);
    expect(result.readyForEmailDraft).toBe(false);
    expect(result.missing).toContain('Describe the records sought.');
    expect(result.emailMissing).toContain('Independently verify the contact channel and record its source and date.');
  });

  it('allows an email draft only after required fields and reviewer contact checks', () => {
    expect(getRequestDraftReadiness(validRequest)).toMatchObject({
      readyForReview: true,
      readyForEmailDraft: true,
      missing: [],
      emailMissing: [],
    });
    expect(getRequestDraftReadiness({
      ...validRequest,
      periodEnd: '2025-12-31',
    }).readyForReview).toBe(false);
    expect(getRequestDraftReadiness({
      ...validRequest,
      recipientEmail: 'not-an-email',
    }).readyForEmailDraft).toBe(false);
  });

  it('includes selected endpoint evidence and clearly states the worksheet is not legal process', () => {
    const text = generateRequestWorksheetText({
      requestType: REQUEST_TYPES.DISCLOSURE,
      selectedExchange: validRequest.recipientEntity,
      recipientEmail: validRequest.recipientEmail,
      endpointAddress: validRequest.endpointAddress,
      recordsScope: validRequest.recordsScope,
      periodStart: validRequest.periodStart,
      periodEnd: validRequest.periodEnd,
      legalBasisReference: validRequest.legalBasisReference,
      evidenceReferences: ['a'.repeat(64) + ' output 0 (0.25 BTC)'],
    });

    expect(text).toContain('NOT A SUBPOENA');
    expect(text).toContain('Disclosure request (requires approved lawful process)');
    expect(text).toContain('a'.repeat(64) + ' output 0 (0.25 BTC)');
    expect(text).toContain('does not establish address ownership');
  });

  it('uses only an explicit reviewer-entered email recipient', () => {
    expect(() => generateComplianceEmailTemplate({
      selectedExchange: 'Example Exchange',
    })).toThrow(/verified recipient email/);

    const mailto = generateComplianceEmailTemplate({
      recipientEmail: validRequest.recipientEmail,
      selectedExchange: validRequest.recipientEntity,
      requestType: REQUEST_TYPES.PRESERVATION,
      recordsScope: validRequest.recordsScope,
      evidenceReferences: ['tx-reference'],
    });
    expect(mailto.startsWith('mailto:verified@example.org?')).toBe(true);
    expect(decodeURIComponent(mailto)).toContain('tx-reference');
    expect(decodeURIComponent(mailto)).toContain('does not itself request, compel, or transmit records');
  });
});
