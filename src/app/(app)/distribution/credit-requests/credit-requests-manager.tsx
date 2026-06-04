'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { useI18n } from '@/lib/i18n/provider';
import { formatCurrency, formatDate } from '@/lib/utils';
import { decideCreditLimit } from '@/app/(app)/fmcg/actions';

export interface CreditRequest {
  id: string;
  customer_id: string;
  current_limit: number | null;
  requested_limit: number;
  approved_amount: number | null;
  status: string;
  reason: string | null;
  created_at: string;
  expiry_date: string | null;
}

const STATUS_VARIANT: Record<string, 'secondary' | 'warning' | 'success' | 'destructive'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
};

export function CreditRequestsManager({
  rows,
  customerLabels,
  canApprove,
}: {
  rows: CreditRequest[];
  customerLabels: Record<string, string>;
  canApprove: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  function statusLabel(s: string) {
    if (s === 'pending') return t('fmcgw1.creditPending');
    if (s === 'approved') return t('fmcgw1.creditApproved');
    if (s === 'rejected') return t('fmcgw1.creditRejected');
    return s;
  }

  function decide(id: string, approve: boolean) {
    const amt = amounts[id];
    startTransition(async () => {
      const res = await decideCreditLimit({
        id,
        approve,
        approvedAmount: approve && amt ? Number(amt) : null,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      toast.success(t('fmcgw1.saved'));
      router.refresh();
    });
  }

  if (rows.length === 0) return <EmptyState title={t('fmcgw1.creditEmpty')} />;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="p-3 text-start font-medium">{t('fmcgw1.creditCustomer')}</th>
                <th className="p-3 text-center font-medium">{t('fmcgw1.creditCurrentLimit')}</th>
                <th className="p-3 text-center font-medium">{t('fmcgw1.creditRequestedLimit')}</th>
                <th className="p-3 text-center font-medium">{t('fmcgw1.creditRequestedAt')}</th>
                <th className="p-3 text-center font-medium">{t('fmcgw1.creditStatus')}</th>
                {canApprove && <th className="p-3 text-center font-medium">{t('fmcgw1.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-3 font-medium">{customerLabels[r.customer_id] ?? '—'}</td>
                  <td className="p-3 text-center tabular-nums" dir="ltr">{formatCurrency(r.current_limit ?? 0)}</td>
                  <td className="p-3 text-center tabular-nums" dir="ltr">{formatCurrency(r.requested_limit)}</td>
                  <td className="p-3 text-center" dir="ltr">{formatDate(r.created_at)}</td>
                  <td className="p-3 text-center">
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'secondary'}>{statusLabel(r.status)}</Badge>
                  </td>
                  {canApprove && (
                    <td className="p-3">
                      {r.status === 'pending' ? (
                        <div className="flex items-center justify-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            dir="ltr"
                            placeholder={t('fmcgw1.creditApprovedAmount')}
                            value={amounts[r.id] ?? ''}
                            onChange={(e) => setAmounts((p) => ({ ...p, [r.id]: e.target.value }))}
                            className="h-8 w-32"
                          />
                          <Button variant="outline" size="sm" onClick={() => decide(r.id, true)}>
                            <Check className="h-4 w-4" /> {t('fmcgw1.creditApprove')}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => decide(r.id, false)}>
                            <X className="h-4 w-4" /> {t('fmcgw1.creditReject')}
                          </Button>
                        </div>
                      ) : (
                        <p className="text-center text-xs text-muted-foreground">
                          {r.approved_amount != null ? formatCurrency(r.approved_amount) : '—'}
                        </p>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
