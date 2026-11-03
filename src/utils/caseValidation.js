/** Validate imported graph references before they enter the investigation store. */
export function isValidCaseShape(obj) {
  if (!obj || typeof obj.id !== 'string' || !obj.id.trim() || !Array.isArray(obj.nodes) || !Array.isArray(obj.links) || obj.nodes.length === 0) return false;
  const nodeIds = new Set();
  for (const node of obj.nodes) {
    if (!node || typeof node.id !== 'string' || !node.id.trim() || nodeIds.has(node.id)) return false;
    nodeIds.add(node.id);
  }
  return obj.links.every(link => {
    if (!link || typeof link !== 'object') return false;
    const source = typeof link.source === 'object' ? link.source?.id : link.source;
    const target = typeof link.target === 'object' ? link.target?.id : link.target;
    return typeof source === 'string' && typeof target === 'string' && nodeIds.has(source) && nodeIds.has(target);
  });
}
