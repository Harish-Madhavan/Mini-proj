import { useState, useEffect, useCallback } from 'react';
import { safeGetItem, safeSetItem } from '../utils/storage';

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
    if (!address || typeof address !== 'string') return false;
    const trimmed = address.trim();
    if (!trimmed) return false;
    let nextWatched = false;
    setWatchlist(prev => {
      if (prev.includes(trimmed)) {
        nextWatched = false;
        return prev.filter(a => a !== trimmed);
      }
      if (prev.length >= MAX_WATCH) return prev;
      nextWatched = true;
      return [...prev, trimmed];
    });
    return nextWatched;
  }, []);

  const add = useCallback((address) => {
    if (!address) return;
    const t = address.trim();
    if (!t || watchlist.includes(t) || watchlist.length >= MAX_WATCH) return;
    setWatchlist(prev => [...prev, t]);
  }, [watchlist]);

  const remove = useCallback((address) => {
    setWatchlist(prev => prev.filter(a => a !== address));
  }, []);

  return { watchlist, isWatched, toggle, add, remove, count: watchlist.length };
}
