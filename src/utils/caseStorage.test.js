import { afterEach, describe, expect, it, vi } from 'vitest';

function createIndexedDbStub() {
  let database;
  const records = new Map();

  const scheduleRequest = (transaction, request, operation) => {
    transaction.pending += 1;
    queueMicrotask(() => {
      request.result = operation();
      request.onsuccess?.();
      transaction.pending -= 1;
      if (transaction.pending === 0) queueMicrotask(() => transaction.oncomplete?.());
    });
    return request;
  };

  const factory = {
    open: () => {
      const request = {};
      queueMicrotask(() => {
        if (!database) {
          database = {
            objectStoreNames: { contains: name => name === 'caseState' },
            createObjectStore: () => ({}),
            close: vi.fn(),
            transaction: () => {
              const transaction = { pending: 0 };
              transaction.objectStore = () => ({
                get: key => scheduleRequest(transaction, {}, () => records.get(key)),
                put: (value, key) => scheduleRequest(transaction, {}, () => {
                  records.set(key, value);
                }),
              });
              return transaction;
            },
          };
          request.result = database;
          request.onupgradeneeded?.();
        } else {
          request.result = database;
        }
        request.onsuccess?.();
      });
      return request;
    },
  };
  return factory;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  localStorage.clear();
});

describe('IndexedDB case persistence', () => {
  it('migrates existing localStorage cases and reloads them from IndexedDB', async () => {
    const state = { scenarios: [{ id: 'legacy-case' }], activeCaseId: 'legacy-case' };
    localStorage.setItem('aegistrace_scenarios', JSON.stringify(state.scenarios));
    localStorage.setItem('aegistrace_activeCaseId', JSON.stringify(state.activeCaseId));
    vi.stubGlobal('indexedDB', createIndexedDbStub());

    const storage = await import('./caseStorage');
    const migrated = await storage.loadCaseState();
    const loadedAgain = await storage.loadCaseState();

    expect(migrated).toMatchObject({ state: expect.objectContaining(state), backend: 'indexedDB', migrated: true });
    expect(loadedAgain).toMatchObject({ state: expect.objectContaining(state), backend: 'indexedDB', migrated: false });
    expect(localStorage.getItem('aegistrace_scenarios')).not.toBeNull();
  });

  it('keeps the newest local recovery copy when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const storage = await import('./caseStorage');
    const oldState = { scenarios: [{ id: 'old' }], activeCaseId: 'old' };
    const newState = { scenarios: [{ id: 'new' }], activeCaseId: 'new' };

    await storage.saveCaseState(oldState);
    await storage.saveCaseState(newState);
    const loaded = await storage.loadCaseState();

    expect(loaded.backend).toBe('localStorage');
    expect(loaded.state).toMatchObject(newState);
    expect(loaded.warning).toContain('IndexedDB is unavailable');
  });

  it('writes and reads case state through IndexedDB', async () => {
    vi.stubGlobal('indexedDB', createIndexedDbStub());
    const storage = await import('./caseStorage');
    const state = { scenarios: [{ id: 'indexed-case' }], activeCaseId: 'indexed-case' };

    await expect(storage.saveCaseState(state)).resolves.toMatchObject({ backend: 'indexedDB' });
    await expect(storage.loadCaseState()).resolves.toMatchObject({
      backend: 'indexedDB',
      state: expect.objectContaining(state),
    });
  });
});
