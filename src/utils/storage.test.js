import { describe, expect, it, vi } from 'vitest';
import { safeSetItem } from './storage';

describe('safe storage writes', () => {
  it('does not delete case data to recover from a quota error', () => {
    const removeItem = vi.fn();
    const originalStorage = global.localStorage;
    const originalWarn = console.warn;
    global.localStorage = { setItem: () => { throw new DOMException('full', 'QuotaExceededError'); }, removeItem };
    console.warn = vi.fn();
    try {
      expect(safeSetItem('aegistrace_watchlist', [])).toBe(false);
      expect(removeItem).not.toHaveBeenCalled();
    } finally {
      global.localStorage = originalStorage;
      console.warn = originalWarn;
    }
  });
});
