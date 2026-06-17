'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import { requestDayReopen } from '@/lib/van-sales/day-reopen-server';

// Reason-based reopen request. The salesman explains why; on submit the server
// records a pending request (reason-required, latest-closed-day only, audited).
export function ReopenRequestForm({ workSessionId }: { workSessionId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) { toast.error(t('vanSales.reopen.reasonRequired')); return; }
    setBusy(true);
    try {
      const res = await requestDayReopen({ workSessionId, reason, note });
      if (!res.ok) { toast.error(res.error ?? t('vanSales.reopen.reasonRequired')); return; }
      toast.success(t('vanSales.reopen.submitted'));
      router.refresh();
    } catch {
      toast.error(t('vanSales.reopen.reasonRequired'));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        {t('vanSales.reopen.requestCta')}
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-lg border p-4 text-start">
      <p className="text-sm text-muted-foreground">{t('vanSales.reopen.intro')}</p>
      <div className="space-y-1.5">
        <Label>{t('vanSales.reopen.reasonLabel')}</Label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          placeholder={t('vanSales.reopen.reasonPlaceholder')}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t('vanSales.reopen.noteLabel')}</Label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          placeholder={t('vanSales.reopen.notePlaceholder')}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>{t('vanSales.reopen.cancel')}</Button>
        <Button onClick={submit} loading={busy} className="flex-1">
          {busy ? t('vanSales.reopen.submitting') : <><Send className="h-4 w-4" /> {t('vanSales.reopen.submit')}</>}
        </Button>
      </div>
    </div>
  );
}
