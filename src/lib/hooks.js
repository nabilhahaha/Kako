import { useEffect, useState, useCallback } from 'react';
import { db } from './db.js';

const useFetchWithRealtime = (fetchFn, realtimeSubscribe, deps = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const result = await fetchFn();
      setData(result);
    } catch (e) {
      console.error(e);
      setError(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
    const unsub = realtimeSubscribe(reload);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  return { data, loading, error, reload };
};

export const useMySubmissions = (salesmanId) =>
  useFetchWithRealtime(
    () => (salesmanId ? db.listMySubmissions(salesmanId) : Promise.resolve([])),
    db.onSubmissionsChange,
    [salesmanId],
  );

export const useAllSubmissions = () =>
  useFetchWithRealtime(() => db.listAllSubmissions(), db.onSubmissionsChange, []);

export const useAggregatedData = () =>
  useFetchWithRealtime(
    () => db.getLatestAggregated(),
    db.onAggregatedChange,
    [],
  );

export const useProfiles = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const result = await db.listProfiles();
      setData(result);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
};
