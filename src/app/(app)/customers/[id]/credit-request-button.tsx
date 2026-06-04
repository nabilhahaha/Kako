'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/provider';
import { formatCurrency } from '@/lib/utils';
import { requestCreditLimit } from '@/app/(app)/fmcg/actions';

/** Inline credit-limit request panel on the customer 360 (credit.request.create).
 *  Submits a request that an approver decides on /distribution/credit-requests. */
export function CreditRequestButton({
  customerId,
  currentLimit,
}: {
  customerId: string;
  currentLimit: number;
}) {
  const { t } = useI18n();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState('');
  const [reason, setReason] = useState('');

  function submit() {
    if (!requested) {
      toast.error(t('fmcgw1.error'));
      return;
    }
    startTransition(async () => {
      const res = await requestCreditLimit({
        customerId,
        requestedLimit: Number(requested),
        reason: reason || null,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      toast.success(t('fmcgw1.creditRequestSent'));
      setOpen(false);
      setRequested('');
      setReason('');
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CreditCard className="h-4 w-4" /> {t('fmcgw1.creditRequestTitle')}
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">{t('fmcgw1.creditRequestDescription')}</p>
        <p className="text-sm">
          {t('fmcgw1.creditCurrentLimit')}: <span className="font-bold tabular-nums" dir="ltr">{formatCurrency(currentLimit)}</span>
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{t('fmcgw1.creditRequestedLimit')}</Label>
            <Input type="number" min={0} step="0.01" dir="ltr" value={requested} onChange={(e) => setRequested(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('fmcgw1.creditReason')}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>{t('fmcgw1.cancel')}</Button>
          <Button size="sm" onClick={submit}>{t('fmcgw1.creditRequestBtn')}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
