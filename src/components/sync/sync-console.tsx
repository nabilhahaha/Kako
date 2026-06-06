'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, RefreshCw, CloudDownload } from 'lucide-react';
import { saveTextFile } from '@/lib/erp/save-file';
import { SyncBadge } from './sync-badge';
import type { OutboxEntry } from '@/lib/sync/types';
import type { ReviewItem } from '@/lib/sync/server/review';

// Admin console for the offline-safe sync subsystem (rendered only behind
// KAKO_SYNC via its page). Shows pending journal, conflict-review queue, and
// local/cloud backup export.
export function SyncConsole({ userId, companyId }: { userId: string; companyId: string | null }) {
  const [pending, setPending] = useState<OutboxEntry[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const { getSyncStore } = await import('@/lib/sync/web/write-seam');
      const store = await getSyncStore();
      setPending((await store.listOutbox()).filter((e) => e.status !== 'synced'));
      const res = await fetch('/api/sync/review');
      if (res.ok) setReviews(((await res.json()) as { reviews: ReviewItem[] }).reviews);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function exportLocal() {
    const { getSyncStore } = await import('@/lib/sync/web/write-seam');
    const { buildLocalBackup, serializeBackup, backupFilename } = await import('@/lib/sync/web/backup');
    const store = await getSyncStore();
    const backup = await buildLocalBackup(store, { userId, companyId });
    await saveTextFile(backupFilename({ userId, companyId }), serializeBackup(backup), 'application/json');
    toast.success('تم تصدير النسخة المحلية');
  }

  async function resolve(id: number, choice: 'keep-local' | 'keep-cloud') {
    const res = await fetch('/api/sync/review', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, choice }),
    });
    if (res.ok) { toast.success('تم حل التعارض'); void refresh(); }
    else toast.error('تعذّر حل التعارض');
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">مزامنة البيانات</h1>
          <p className="text-sm text-muted-foreground">الحالة، التغييرات المعلّقة، التعارضات، والنسخ الاحتياطية.</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge />
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> تحديث
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-wrap gap-2 p-4">
          <Button variant="outline" onClick={() => void exportLocal()} className="gap-1.5">
            <Download className="h-4 w-4" /> تصدير نسخة محلية
          </Button>
          <a
            href="/api/sync/backup"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted"
          >
            <CloudDownload className="h-4 w-4" /> تصدير نسخة سحابية
          </a>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="font-semibold">التغييرات المعلّقة ({pending.length})</h2>
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-start">
              <th className="p-2 text-start">الكيان</th><th className="p-2 text-start">عملية</th>
              <th className="p-2 text-start">الحالة</th><th className="p-2 text-start">محاولات</th>
            </tr></thead>
            <tbody>
              {pending.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="p-2">{e.entity}</td><td className="p-2">{e.op}</td>
                  <td className="p-2">{e.status}</td><td className="p-2">{e.attempts}</td>
                </tr>
              ))}
              {pending.length === 0 && <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">لا توجد تغييرات معلّقة.</td></tr>}
            </tbody>
          </table>
        </CardContent></Card>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">تعارضات الجرد بانتظار المراجعة ({reviews.length})</h2>
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="p-2 text-start">العنصر</th><th className="p-2 text-start">القيمة المحلية</th>
              <th className="p-2 text-start">قيمة السحابة</th><th className="p-2 text-start">الإجراء</th>
            </tr></thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2 font-mono">{r.pk}</td>
                  <td className="p-2" dir="ltr">{JSON.stringify(r.proposed)}</td>
                  <td className="p-2" dir="ltr">{JSON.stringify(r.remote)}</td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void resolve(r.id, 'keep-local')}>الاحتفاظ بالمحلي</Button>
                      <Button size="sm" variant="outline" onClick={() => void resolve(r.id, 'keep-cloud')}>الاحتفاظ بالسحابة</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {reviews.length === 0 && <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">لا توجد تعارضات.</td></tr>}
            </tbody>
          </table>
        </CardContent></Card>
      </section>
    </div>
  );
}
