export function hasAttributionEvidenceRecord(node) {
  const evidence = node?.details?.identityEvidence;
  const address = node?.details?.address;
  return typeof evidence?.source === 'string' && evidence.source.trim().length > 0 &&
    typeof evidence.subject === 'string' && evidence.subject.trim().length > 0 &&
    (!address || evidence.address === address);
}
