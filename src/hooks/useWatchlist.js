import { useState, useCallback } from 'react';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { isJoinableAddress } from '../utils/syndicateAnalysis';
import { makeWatchEntry, normalizeWatchlist, MAX_WATCHLIST } from '../utils/watchlistManager';

const STORAGE_KEY = 'aegistrace_watchlist';

const entryAddress = (entry) => (typeof entry === 'string' ? entry : entry?.address);

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState(() => normalizeWatchlist(safeGetItem(STORAGE_KEY, [])));

  const isWatched = useCallback((address) => {
    if (!address) return false;
    return watchlist.some(entry => entryAddress(entry) === address);
  }, [watchlist]);

  const toggle = useCallback((address) => {
    // Returns 'added' | 'removed' | 'invalid' | 'full'. Decided BEFORE
    // setState: reading a flag written inside the updater always returns the
    // stale value, since updaters run async during re-render.
    if (!isJoinableAddress(address)) return 'invalid';
    const trimmed = address.trim();
    if (watchlist.some(entry => entryAddress(entry) === trimmed)) {
      const updated = watchlist.filter(entry => entryAddress(entry) !== trimmed);
      if (!safeSetItem(STORAGE_KEY, updated)) return 'storage_error';
      setWatchlist(updated);
      return 'removed';
    }
    if (watchlist.length >= MAX_WATCHLIST) return 'full';
    const updated = [...watchlist, makeWatchEntry(trimmed, { notes: 'Added from graph.' })];
    if (!safeSetItem(STORAGE_KEY, updated)) return 'storage_error';
    setWatchlist(updated);
    return 'added';
  }, [watchlist]);

  const add = useCallback((address) => {
    if (!isJoinableAddress(address)) return false;
    const t = address.trim();
    if (watchlist.some(entry => entryAddress(entry) === t) || watchlist.length >= MAX_WATCHLIST) return false;
    const updated = [...watchlist, makeWatchEntry(t)];
    if (!safeSetItem(STORAGE_KEY, updated)) return false;
    setWatchlist(updated);
    return true;
  }, [watchlist]);

  const remove = useCallback((address) => {
    const updated = watchlist.filter(entry => entryAddress(entry) !== address);
    if (!safeSetItem(STORAGE_KEY, updated)) return false;
    setWatchlist(updated);
    return true;
  }, [watchlist]);

  return { watchlist, isWatched, toggle, add, remove, count: watchlist.length };
}
