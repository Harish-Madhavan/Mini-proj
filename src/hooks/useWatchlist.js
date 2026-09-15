import { useState, useEffect, useCallback } from 'react';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { isJoinableAddress } from '../utils/syndicateAnalysis';
import { makeWatchEntry, normalizeWatchlist } from '../utils/watchlistManager';

const STORAGE_KEY = 'aegistrace_watchlist';
const MAX_WATCH = 100;

const entryAddress = (entry) => (typeof entry === 'string' ? entry : entry?.address);

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState(() => normalizeWatchlist(safeGetItem(STORAGE_KEY, [])));

  useEffect(() => {
    safeSetItem(STORAGE_KEY, watchlist);
  }, [watchlist]);

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
      setWatchlist(prev => prev.filter(entry => entryAddress(entry) !== trimmed));
      return 'removed';
    }
    if (watchlist.length >= MAX_WATCH) return 'full';
    setWatchlist(prev => (
      prev.some(entry => entryAddress(entry) === trimmed)
        ? prev
        : [...prev, makeWatchEntry(trimmed, { notes: 'Added from graph.' })]
    ));
    return 'added';
  }, [watchlist]);

  const add = useCallback((address) => {
    if (!isJoinableAddress(address)) return false;
    const t = address.trim();
    if (watchlist.some(entry => entryAddress(entry) === t) || watchlist.length >= MAX_WATCH) return false;
    setWatchlist(prev => (
      prev.some(entry => entryAddress(entry) === t) ? prev : [...prev, makeWatchEntry(t)]
    ));
    return true;
  }, [watchlist]);

  const remove = useCallback((address) => {
    setWatchlist(prev => prev.filter(entry => entryAddress(entry) !== address));
  }, []);

  return { watchlist, isWatched, toggle, add, remove, count: watchlist.length };
}
