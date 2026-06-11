'use client';

import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { CriticalActionButton } from '@/lib/critical-action';
import { writeOffBatch, type ExpiryRow } from './actions';

const BUCKET_TONE: Record<string, 'destructive' | 'secondary'> = {
  expired: 'destructive', d30: 'destructive', d60: 'secondary', d90: 'secondary',
};

export function ExpiryManager({ rows, summary, canWriteOff }: {
  rows: ExpiryRow[];
  summary: Record<string, number>;
  canWriteOff: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const nm = (r: ExpiryRow) => (locale === 'ar' ? r.name_ar || r.name : r.name);

  const cards = [
    { key: 'expired', tone: 'text-destructive' },
    { key: 'd30', tone: 'text-destructive' },
    { key: 'd60', tone: 'text-amber-600' },
    { key: 'd90', tone: 'text-amber-600' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.key}><CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">{t(`pharmExpiry.bucket.${c.key}`)}</div>
            <div className={`text-2xl font-bold ${c.tone}`}>{summary[c.key] ?? 0}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card><CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('pharmExpiry.none')}</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                <th className="p-3 text-start font-medium">{t('pharmExpiry.product')}</th>
                <th className="p-3 text-start font-medium">{t('pharmExpiry.batch')}</th>
                <th className="p-3 text-start font-medium">{t('pharmExpiry.expiry')}</th>
                <th className="p-3 text-center font-medium">{t('pharmExpiry.days')}</th>
                <th className="p-3 text-end font-medium">{t('pharmExpiry.qty')}</th>
                <th className="p-3 text-center font-medium">{t('pharmExpiry.status')}</th>
                {canWriteOff && <th className="p-3" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.batch_id} className="border-b last:border-0">
                  <td className="p-3">{nm(r)}</td>
                  <td className="p-3 text-muted-foreground" dir="ltr">{r.batch_number || '—'}</td>
                  <td className="p-3" dir="ltr">{formatDate(r.expiry_date)}</td>
                  <td className="p-3 text-center tabular-nums" dir="ltr">{r.days_to_expiry ?? '—'}</td>
                  <td className="p-3 text-end tabular-nums" dir="ltr">{r.qty_on_hand}</td>
                  <td className="p-3 text-center">
                    <Badge variant={BUCKET_TONE[r.bucket] ?? 'secondary'}>{t(`pharmExpiry.bucket.${r.bucket}`)}</Badge>
                  </td>
                  {canWriteOff && (
                    <td className="p-3 text-end">
                      <CriticalActionButton
                        variant="ghost" size="sm" className="text-destructive"
                        config={{
                          catalogKey: 'expiry.writeOff',
                          action: t('critical.actions.expiryWriteOff'),
                          record: `${nm(r)} · ${r.batch_number ?? '—'}`,
                          execute: async (reason) => {
                            const res = await writeOffBatch(r.batch_id, reason);
                            return { ok: res.ok, error: res.error };
                          },
                          onDone: () => router.refresh(),
                        }}
                      >
                        {t('pharmExpiry.writeOff')}
                      </CriticalActionButton>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </CardContent></Card>
    </div>
  );
}
