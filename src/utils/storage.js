/**
 * Safe localStorage wrapper with error handling and quota management
 */

export function safeGetItem(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn(`[storage] Failed to read ${key}:`, e);
    return fallback;
  }
}

export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`[storage] Failed to write ${key}:`, e);
    // Quota exceeded - try to clear oldest cache
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      try {
        // Remove largest keys matching aegistrace
        const keysToCheck = ['aegistrace_scenarios', 'aegistrace_activeCaseId'];
        for (const k of keysToCheck) {
          if (k !== key) localStorage.removeItem(k);
        }
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

export function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`[storage] Failed to remove ${key}:`, e);
  }
}
