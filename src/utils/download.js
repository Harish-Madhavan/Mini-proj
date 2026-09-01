/**
 * Shared download utilities - deduplicates blob/objectURL patterns
 */

export function downloadBlob(content, filename, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.setAttribute('href', url);
  anchor.setAttribute('download', filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Delay revocation to allow download to start
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(data, filename) {
  const json = JSON.stringify(data, null, 2);
  downloadBlob(json, filename.endsWith('.json') ? filename : `${filename}.json`, 'application/json;charset=utf-8');
}

export function downloadText(text, filename) {
  downloadBlob(text, filename, 'text/plain;charset=utf-8');
}
