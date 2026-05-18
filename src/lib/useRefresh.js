// Reusable refresh hook.
//
//   const { refresh, isRefreshing, lastRefreshedAt, error } = useRefresh(fn);
//
// Wraps an async `fn` with:
//   - loading state
//   - lastRefreshedAt timestamp (updated only on success)
//   - 1-second debounce
//   - mounted-ref guard so we don't setState after unmount
//
// `fn` is the actual data-fetcher. It can Promise.all internally to refresh
// multiple sources in parallel.

import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_INTERVAL_MS = 1000;

export function useRefresh(fetchFn) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [error, setError] = useState(null);

  const lastCallRef = useRef(0);
  const mountedRef = useRef(true);
  const fnRef = useRef(fetchFn);
  fnRef.current = fetchFn;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastCallRef.current < MIN_INTERVAL_MS) return;
    lastCallRef.current = now;
    setIsRefreshing(true);
    setError(null);
    try {
      await fnRef.current();
      if (mountedRef.current) {
        setLastRefreshedAt(new Date());
      }
    } catch (e) {
      if (mountedRef.current) setError(e);
      throw e;
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  }, []);

  return { refresh, isRefreshing, lastRefreshedAt, error };
}
