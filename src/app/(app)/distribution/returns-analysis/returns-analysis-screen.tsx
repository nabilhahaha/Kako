'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { useI18n } from '@/lib/i18n/provider';
import { formatCurrency } from '@/lib/utils';
import {
  returnsByReason,
  upsertReturnReason,
  deleteReturnReason,
  type ReturnsByReasonRow,
} from '@/app/(app)/fmcg/actions';

export interface ReasonRow {
  id: string;
  code: string;
  label_en: string | null;
  label_ar: string | null;
  is_active: boolean;
  sort: number;
}

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
const TODAY = new Date().toISOString().slice(0, 10);

export function ReturnsAnalysisScreen({
  reasons,
  canManageReasons,
}: {
  reasons: ReasonRow[];
  canManageReasons: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(TODAY);
  const [rows, setRows] = useState<ReturnsByReasonRow[] | null>(null);
  const [showReasons, setShowReasons] = useState(false);

  // New-reason form.
  const [code, setCode] = useState('');
  const [labelAr, setLabelAr] = useState('');
  const [labelEn, setLabelEn] = useState('');

  function run() {
    startTransition(async () => {
      const res = await returnsByReason(from, to);
      if (!res.ok) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      setRows(res.data ?? []);
    });
  }

  function addReason() {
    if (!code.trim()) {
      toast.error(t('fmcgw1.error'));
      return;
    }
    startTransition(async () => {
      const res = await upsertReturnReason({ code: code.trim(), label_ar: labelAr || null, label_en: labelEn || null });
      if (!res.ok) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      toast.success(t('fmcgw1.saved'));
      setCode('');
      setLabelAr('');
      setLabelEn('');
      router.refresh();
    });
  }

  function removeReason(id: string) {
    startTransition(async () => {
      const res = await deleteReturnReason(id);
      if (!res.ok) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      toast.success(t('fmcgw1.deleted'));
      router.refresh();
    });
  }

  const reasonLabel = (r: ReturnsByReasonRow) =>
    (locale === 'ar' ? r.reason_label_ar || r.reason_label_en : r.reason_label_en || r.reason_label_ar) ||
    t('fmcgw1.returnsNoReason');

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label>{t('fmcgw1.from')}</Label>
            <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('fmcgw1.to')}</Label>
            <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={run}>
            <Search className="h-4 w-4" /> {t('fmcgw1.apply')}
          </Button>
          {canManageReasons && (
            <Button variant="outline" className="ms-auto" onClick={() => setShowReasons((v) => !v)}>
              {t('fmcgw1.returnsManageReasons')}
            </Button>
          )}
        </CardContent>
      </Card>

      {showReasons && canManageReasons && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <h2 className="font-semibold">{t('fmcgw1.reasonsTitle')}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label>{t('fmcgw1.reasonCode')}</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>{t('fmcgw1.reasonLabelAr')}</Label>
                <Input value={labelAr} onChange={(e) => setLabelAr(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('fmcgw1.reasonLabelEn')}</Label>
                <Input value={labelEn} onChange={(e) => setLabelEn(e.target.value)} dir="ltr" />
              </div>
              <div className="flex items-end">
                <Button onClick={addReason} className="w-full">
                  <Plus className="h-4 w-4" /> {t('fmcgw1.reasonAdd')}
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-start font-medium">{t('fmcgw1.reasonCode')}</th>
                    <th className="p-2 text-start font-medium">{t('fmcgw1.reasonLabelAr')}</th>
                    <th className="p-2 text-start font-medium">{t('fmcgw1.reasonLabelEn')}</th>
                    <th className="p-2 text-center font-medium">{t('fmcgw1.reasonActive')}</th>
                    <th className="p-2 text-center font-medium">{t('fmcgw1.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {reasons.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-2" dir="ltr">{r.code}</td>
                      <td className="p-2">{r.label_ar || '—'}</td>
                      <td className="p-2" dir="ltr">{r.label_en || '—'}</td>
                      <td className="p-2 text-center">
                        <Badge variant={r.is_active ? 'success' : 'secondary'}>{r.is_active ? t('fmcgw1.yes') : t('fmcgw1.no')}</Badge>
                      </td>
                      <td className="p-2 text-center">
                        <Button variant="ghost" size="icon" onClick={() => removeReason(r.id)} aria-label={t('fmcgw1.delete')}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {rows == null ? null : rows.length === 0 ? (
        <EmptyState title={t('fmcgw1.returnsEmpty')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('fmcgw1.returnsReason')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcgw1.returnsCount')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcgw1.returnsValue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.reason_id ?? `none-${i}`} className="border-b">
                      <td className="p-3 font-medium">{reasonLabel(r)}</td>
                      <td className="p-3 text-center tabular-nums" dir="ltr">{r.return_count}</td>
                      <td className="p-3 text-center tabular-nums" dir="ltr">{formatCurrency(r.total_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
