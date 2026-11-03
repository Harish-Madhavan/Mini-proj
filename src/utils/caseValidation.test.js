import { describe, expect, it } from 'vitest';
import { isValidCaseShape } from './caseValidation';

describe('case import graph validation', () => {
  const valid = { id: 'case-1', nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b' }] };

  it('accepts a graph with known endpoints', () => {
    expect(isValidCaseShape(valid)).toBe(true);
    expect(isValidCaseShape({ ...valid, links: [{ source: { id: 'a' }, target: { id: 'b' } }] })).toBe(true);
  });

  it('rejects duplicate node ids and dangling link endpoints', () => {
    expect(isValidCaseShape({ ...valid, nodes: [{ id: 'a' }, { id: 'a' }] })).toBe(false);
    expect(isValidCaseShape({ ...valid, links: [{ source: 'a', target: 'missing' }] })).toBe(false);
    expect(isValidCaseShape({ ...valid, nodes: [{ id: 'a' }, null] })).toBe(false);
  });
});
