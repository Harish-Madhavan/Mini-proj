function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter(key => value[key] !== undefined)
        .sort()
        .map(key => [key, canonicalize(value[key])])
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}

export function serializeEvidencePayload(payload) {
  return JSON.stringify(canonicalize(payload));
}

export async function hashEvidencePayload(payload, cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider?.subtle || typeof TextEncoder === 'undefined') {
    throw new Error('Web Crypto SHA-256 is unavailable in this environment.');
  }

  const bytes = new TextEncoder().encode(serializeEvidencePayload(payload));
  const digest = await cryptoProvider.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `SHA256:${hex}`;
}
