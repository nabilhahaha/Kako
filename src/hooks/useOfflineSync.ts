import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  initOfflineDB,
  getPendingVisits,
  getSyncQueue,
  removeSyncItem,
  markVisitSynced,
  getOfflineStats,
  type PendingVisit,
  type SyncQueueItem,
  type OfflineStats,
} from '@/lib/offlineSync';
import { supabase } from '@/lib/supabase';

// --- useOnlineStatus ---

export function useOnlineStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}

// --- useOfflineSync ---

interface UseOfflineSyncReturn {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  syncAll: () => Promise<void>;
}

export function useOfflineSync(): UseOfflineSyncReturn {
  const { isOnline } = useOnlineStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const prevOnlineRef = useRef(isOnline);

  // Initialize DB on mount
  useEffect(() => {
    initOfflineDB().catch((err) =>
      console.error('Failed to initialize offline DB:', err),
    );
  }, []);

  // Refresh pending count
  const refreshStats = useCallback(async () => {
    try {
      const stats = await getOfflineStats();
      setPendingCount(
        stats.pendingVisits + stats.pendingPhotos + stats.queueSize,
      );
    } catch {
      // silently ignore if DB not ready
    }
  }, []);

  // Sync a single pending visit to Supabase
  const syncVisit = async (visit: PendingVisit): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('visits')
        .insert({
          customer_id: visit.customerId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          visit_type: visit.visitType,
          visited_at: visit.createdAt,
          latitude: visit.latitude,
          longitude: visit.longitude,
          notes: visit.notes,
        })
        .select('id')
        .single();

      if (error) throw error;
      if (data) {
        await markVisitSynced(visit.localId, data.id);

        // Also sync visit reasons if any
        if (visit.reasonIds.length > 0) {
          const reasonRows = visit.reasonIds.map((rid) => ({
            visit_id: data.id,
            reason_id: rid,
          }));
          await supabase.from('visit_reason_links').insert(reasonRows);
        }
      }
      return true;
    } catch (err) {
      console.error('Failed to sync visit:', visit.localId, err);
      return false;
    }
  };

  // Process a single sync queue item
  const processSyncItem = async (item: SyncQueueItem): Promise<boolean> => {
    try {
      const payload = item.payload as Record<string, unknown>;

      if (item.action === 'create') {
        const { error } = await supabase.from(item.entity).insert(payload);
        if (error) throw error;
      } else if (item.action === 'update') {
        const id = payload.id as string;
        const { id: _id, ...rest } = payload;
        const { error } = await supabase
          .from(item.entity)
          .update(rest)
          .eq('id', id);
        if (error) throw error;
      } else if (item.action === 'delete') {
        const id = payload.id as string;
        const { error } = await supabase
          .from(item.entity)
          .delete()
          .eq('id', id);
        if (error) throw error;
      }

      await removeSyncItem(item.id);
      return true;
    } catch (err) {
      console.error('Failed to process sync item:', item.id, err);
      return false;
    }
  };

  // Sync all pending data
  const syncAll = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;

    syncingRef.current = true;
    setIsSyncing(true);

    try {
      let syncedCount = 0;
      let failedCount = 0;

      // 1. Sync pending visits
      const pendingVisits = await getPendingVisits();
      for (const visit of pendingVisits) {
        const ok = await syncVisit(visit);
        if (ok) syncedCount++;
        else failedCount++;
      }

      // 2. Process sync queue
      const queueItems = await getSyncQueue();
      for (const item of queueItems) {
        const ok = await processSyncItem(item);
        if (ok) syncedCount++;
        else failedCount++;
      }

      // Update state
      const now = new Date().toISOString();
      setLastSyncAt(now);
      await refreshStats();

      // Show notifications
      if (syncedCount > 0 && failedCount === 0) {
        toast.success('تمت المزامنة بنجاح', {
          description: `تم مزامنة ${syncedCount} عنصر`,
        });
      } else if (syncedCount > 0 && failedCount > 0) {
        toast.warning('مزامنة جزئية', {
          description: `نجح ${syncedCount} وفشل ${failedCount} عنصر`,
        });
      } else if (failedCount > 0) {
        toast.error('فشلت المزامنة', {
          description: `فشل مزامنة ${failedCount} عنصر`,
        });
      }
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('حدث خطأ أثناء المزامنة');
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [refreshStats]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      toast.info('تم استعادة الاتصال', {
        description: 'جاري مزامنة البيانات المعلقة...',
      });
      syncAll();
    }

    if (!isOnline && prevOnlineRef.current) {
      toast.warning('انقطع الاتصال بالإنترنت', {
        description: 'سيتم حفظ البيانات محلياً',
      });
    }

    prevOnlineRef.current = isOnline;
  }, [isOnline, syncAll]);

  // Refresh stats periodically
  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 30_000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  return { isOnline, isSyncing, pendingCount, lastSyncAt, syncAll };
}

// --- useSyncStatus ---

interface SyncStatusReturn {
  stats: OfflineStats | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useSyncStatus(): SyncStatusReturn {
  const [stats, setStats] = useState<OfflineStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const s = await getOfflineStats();
      setStats(s);
    } catch {
      // DB not ready yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initOfflineDB().then(() => refresh());
  }, [refresh]);

  return { stats, loading, refresh };
}
