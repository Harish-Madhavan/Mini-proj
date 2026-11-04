import { safeGetItem, safeRemoveItem, safeSetItem } from './storage';

const DATABASE_NAME = 'aegistrace';
const DATABASE_VERSION = 1;
const STORE_NAME = 'caseState';
const CASE_STATE_KEY = 'current';
const RECOVERY_KEY = 'aegistrace_case_state_recovery';
const LEGACY_SCENARIOS_KEY = 'aegistrace_scenarios';
const LEGACY_ACTIVE_CASE_KEY = 'aegistrace_activeCaseId';

let databasePromise;
let writeQueue = Promise.resolve();
let lastUpdatedAt = 0;

function nextUpdatedAt() {
  lastUpdatedAt = Math.max(Date.now(), lastUpdatedAt + 1);
  return lastUpdatedAt;
}

function trackUpdatedAt(state) {
  if (Number.isFinite(state?.updatedAt)) {
    lastUpdatedAt = Math.max(lastUpdatedAt, state.updatedAt);
  }
  return state;
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error('Failed to open case database.'));
    request.onblocked = () => reject(new Error('Case database upgrade is blocked by another tab.'));
  }).catch(error => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

function readIndexedState(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(CASE_STATE_KEY);
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || new Error('Failed to read saved cases.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('Failed to read saved cases.'));
    transaction.onabort = () => reject(transaction.error || new Error('Reading saved cases was aborted.'));
  });
}

function writeIndexedState(database, state) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(state, CASE_STATE_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Failed to save cases.'));
    transaction.onabort = () => reject(transaction.error || new Error('Saving cases was aborted.'));
  });
}

function getLegacyState() {
  const scenarios = safeGetItem(LEGACY_SCENARIOS_KEY, null);
  const activeCaseId = safeGetItem(LEGACY_ACTIVE_CASE_KEY, null);
  if (scenarios == null && activeCaseId == null) return null;
  return { scenarios, activeCaseId, updatedAt: 0 };
}

function readRecoveryState() {
  return safeGetItem(RECOVERY_KEY, null);
}

function chooseNewestState(indexedState, recoveryState) {
  if (!indexedState) return trackUpdatedAt(recoveryState);
  if (!recoveryState) return trackUpdatedAt(indexedState);
  trackUpdatedAt(indexedState);
  trackUpdatedAt(recoveryState);
  return (recoveryState.updatedAt || 0) > (indexedState.updatedAt || 0)
    ? recoveryState
    : indexedState;
}

export async function loadCaseState() {
  const recoveryState = readRecoveryState();
  try {
    const database = await openDatabase();
    const indexedState = await readIndexedState(database);
    const recovered = chooseNewestState(indexedState, recoveryState);
    if (recovered) {
      return {
        state: recovered,
        backend: recovered === recoveryState ? 'localStorage' : 'indexedDB',
        warning: recovered === recoveryState
          ? 'Recovered the latest saved cases from browser storage after a previous IndexedDB write failure.'
          : null,
        migrated: false,
      };
    }

    const legacyState = getLegacyState();
    if (!legacyState) {
      return { state: null, backend: 'indexedDB', warning: null, migrated: false };
    }

    const migratedState = { ...legacyState, updatedAt: nextUpdatedAt() };
    try {
      await writeIndexedState(database, migratedState);
      safeRemoveItem(RECOVERY_KEY);
      return { state: migratedState, backend: 'indexedDB', warning: null, migrated: true };
    } catch (error) {
      const backupSaved = safeSetItem(RECOVERY_KEY, migratedState);
      return {
        state: migratedState,
        backend: 'localStorage',
        warning: backupSaved
          ? `Cases were loaded from legacy storage but could not be migrated to IndexedDB: ${error.message}`
          : `Cases were loaded from legacy storage but could not be migrated or backed up: ${error.message}`,
        migrated: false,
      };
    }
  } catch (error) {
    const legacyState = getLegacyState();
    const state = chooseNewestState(recoveryState, legacyState);
    return {
      state,
      backend: 'localStorage',
      warning: error.message,
      migrated: false,
    };
  }
}

async function persistCaseState(state) {
  const nextState = { ...state, updatedAt: nextUpdatedAt() };
  try {
    const database = await openDatabase();
    await writeIndexedState(database, nextState);
    safeRemoveItem(RECOVERY_KEY);
    return { backend: 'indexedDB', warning: null };
  } catch (error) {
    const recoverySaved = safeSetItem(RECOVERY_KEY, nextState);
    return {
      backend: 'localStorage',
      warning: recoverySaved
        ? `IndexedDB could not save the latest case changes; a browser-storage recovery copy was saved. ${error.message}`
        : `IndexedDB and browser-storage recovery both failed; latest changes are only in memory. ${error.message}`,
    };
  }
}

export function saveCaseState(state) {
  const queuedWrite = writeQueue.then(
    () => persistCaseState(state),
    () => persistCaseState(state)
  );
  writeQueue = queuedWrite.then(() => undefined, () => undefined);
  return queuedWrite;
}
