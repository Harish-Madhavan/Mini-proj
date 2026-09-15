import { useState, useEffect, useCallback } from 'react';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { isJoinableAddress } from '../utils/syndicateAnalysis';

const STORAGE_KEY = 'aegistrace_watchlist';
const MAX_WATCH = 100;

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState(() => {
    const saved = safeGetItem(STORAGE_KEY, []);
    return Array.isArray(saved) ? saved.slice(0, MAX_WATCH) : [];
  });

  useEffect(() => {
    safeSetItem(STORAGE_KEY, watchlist);
  }, [watchlist]);

  const isWatched = useCallback((address) => {
    if (!address) return false;
    return watchlist.includes(address);
  }, [watchlist]);

  const toggle = useCallback((address) => {
    // Returns 'added' | 'removed' | 'invalid' | 'full'. Decided BEFORE
    // setState: reading a flag written inside the updater always returns the
    // stale value, since updaters run async during re-render.
    if (!isJoinableAddress(address)) return 'invalid';
    const trimmed = address.trim();
    if (watchlist.includes(trimmed)) {
      setWatchlist(prev => prev.filter(a => a !== trimmed));
      return 'removed';
    }
    if (watchlist.length >= MAX_WATCH) return 'full';
    setWatchlist(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    return 'added';
  }, [watchlist]);

  const add = useCallback((address) => {
    if (!isJoinableAddress(address)) return false;
    const t = address.trim();
    if (watchlist.includes(t) || watchlist.length >= MAX_WATCH) return false;
    setWatchlist(prev => (prev.includes(t) ? prev : [...prev, t]));
    return true;
  }, [watchlist]);

  const remove = useCallback((address) => {
    setWatchlist(prev => prev.filter(a => a !== address));
  }, []);

  return { watchlist, isWatched, toggle, add, remove, count: watchlist.length };
}
