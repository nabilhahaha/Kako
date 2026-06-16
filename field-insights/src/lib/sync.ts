import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { supabase } from './supabase';

// Enqueue a mutation. Writes are idempotent by row id, so a retried flush
// never duplicates data (insert is performed as an upsert on the primary key).
export async function enqueue(
  table: string,
  op: 'insert' | 'update',
  payload: Record<string, unknown> & { id: string },
) {
  await db.outbox.put({
    id: payload.id,
    table,
    op,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  });
  void flushQueue();
}

let flushing = false;

export async function flushQueue(): Promise<void> {
  if (flushing) return;
  if (!supabase || typeof navigator !== 'undefined' && !navigator.onLine) return;
  flushing = true;
  try {
    const items = await db.outbox.orderBy('createdAt').toArray();
    for (const item of items) {
      const client = supabase;
      if (!client) break;
      const { error } = await client
        .from(item.table as never)
        .upsert(item.payload as never, { onConflict: 'id' });
      if (error) {
        await db.outbox.update(item.id, {
          attempts: item.attempts + 1,
          lastError: error.message,
        });
        // stop on first error; will retry on next trigger
        break;
      }
      await db.outbox.delete(item.id);
      // mark a locally-cached visit as synced
      await db.visits.where('id').equals(item.id).modify({ sync_status: 'synced' }).catch(() => {});
    }
  } finally {
    flushing = false;
  }
}

// React hook: flush on mount and whenever connectivity returns; expose count.
export function useSyncEngine() {
  const pending = useLiveQuery(() => db.outbox.count(), [], 0);
  useEffect(() => {
    void flushQueue();
    const onOnline = () => void flushQueue();
    window.addEventListener('online', onOnline);
    const interval = window.setInterval(() => void flushQueue(), 30_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(interval);
    };
  }, []);
  return { pending: pending ?? 0 };
}
