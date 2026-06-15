'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X, CalendarDays, User, RefreshCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import { decideReopenRequest } from '@/lib/van-sales/day-reopen-server';
import type { PendingReopen } from '@/lib/van-sales/day-server';

// Approver inbox row. Shows everything the governance rule requires (day date,
// salesman, settlement status, reopen count, reason, request timestamp) and
// captures the approval comment; the decision records approved-by + timestamp.
export function ReopenApprovalList({ requests }: { requests: PendingReopen[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const fmt = (iso: string) => { try { return new Date(iso).toLocaleString(locale === 'ar' ? 'ar' : 'en'); } catch { return iso; } };

  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusy(id);
    try {
      const res = await decideReopenRequest({ requestId: id, decision, note: notes[id] });
      if (!res.ok) { toast.error(res.error ?? '—'); return; }
      toast.success(t(decision === 'approve' ? 'vanSales.reopen.approvals.approved' : 'vanSales.reopen.approvals.rejected'));
      router.refresh();
    } catch {
      toast.error('—');
    } finally {
      setBusy(null);
    }
  }

  if (requests.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('vanSales.reopen.approvals.empty')}</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <Card key={r.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium"><CalendarDays className="h-4 w-4 text-muted-foreground" /> {r.workDate}</span>
              <span className="inline-flex items-center gap-1.5"><User className="h-4 w-4 text-muted-foreground" /> {r.salesmanName}</span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground"><RefreshCcw className="h-3.5 w-3.5" /> {t('vanSales.reopen.approvals.reopenCount')}: {r.reopenCount}</span>
              <Badge variant="secondary">{t('vanSales.reopen.approvals.settlement')}: {r.settlementStatus === 'none' ? t('vanSales.reopen.approvals.settlementNone') : r.settlementStatus}</Badge>
            </div>

            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <div className="font-medium">{t('vanSales.reopen.approvals.reason')}</div>
              <div className="whitespace-pre-wrap">{r.reason}</div>
              {r.note && <div className="mt-1 text-muted-foreground whitespace-pre-wrap">{r.note}</div>}
              <div className="mt-1 text-xs text-muted-foreground">{t('vanSales.reopen.approvals.requestedAt')}: {fmt(r.createdAt)}</div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('vanSales.reopen.approvals.noteLabel')}</Label>
              <input
                value={notes[r.id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                placeholder={t('vanSales.reopen.approvals.notePlaceholder')}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" loading={busy === r.id} onClick={() => decide(r.id, 'reject')}>
                {busy === r.id ? t('common.processing') : <><X className="h-4 w-4" /> {t('vanSales.reopen.approvals.reject')}</>}
              </Button>
              <Button className="flex-1" loading={busy === r.id} onClick={() => decide(r.id, 'approve')}>
                {busy === r.id ? t('common.processing') : <><Check className="h-4 w-4" /> {t('vanSales.reopen.approvals.approve')}</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
