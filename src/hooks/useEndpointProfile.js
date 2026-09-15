import { useState, useEffect } from 'react';
import { fetchAddressSummary, classifyEndpointActivity } from '../utils/bitcoinApi';
import { isJoinableAddress } from '../utils/syndicateAnalysis';

/**
 * Resolve an end-receiver endpoint profile for an address.
 * Skips non-joinable identifiers (tx hubs, OP_RETURN, pseudo-ids); gateway
 * responses ride the shared 5-minute apiCache, so repeated selections are free.
 */
export function useEndpointProfile(address, enabled = true) {
  const [state, setState] = useState({ status: 'idle', profile: null });

  useEffect(() => {
    if (!enabled || !isJoinableAddress(address)) {
      setState({ status: 'idle', profile: null });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', profile: null });
    fetchAddressSummary(address).then(
      (summary) => {
        if (!cancelled) setState({ status: 'ready', profile: classifyEndpointActivity(summary) });
      },
      () => {
        if (!cancelled) setState({ status: 'error', profile: null });
      }
    );
    return () => { cancelled = true; };
  }, [address, enabled]);

  return state;
}
