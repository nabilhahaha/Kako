'use client';

import Link from 'next/link';
import { ClipboardList, ChevronLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { FieldSyncStatus } from '@/components/field/sync-status';

export type CaptureKind = 'merchandising' | 'competitor' | 'survey' | 'out_of_stock' | 'opportunity' | 'quick';
export interface CaptureForm { id: string; key: string; name: string; kind: CaptureKind }
export interface CaptureHistory { id: string; kind: CaptureKind; score: number | null; createdAt: string; formName: string }

const ORDER: CaptureKind[] = ['merchandising', 'competitor', 'survey', 'out_of_stock', 'opportunity', 'quick'];

/** Grouped, one-tap capture launcher. Customer + visit context flow via the link. */
export function CaptureLauncher({ customerId, visitId, forms, history }: { customerId: string; visitId: string | null; forms: CaptureForm[]; history: CaptureHistory[] }) {
  const { t } = useI18n();
  const q = `customer=${customerId}${visitId ? `&visit=${visitId}` : ''}`;
  const groups = ORDER.map((k) => ({ kind: k, items: forms.filter((f) => f.kind === k) })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4 pb-6">
      <FieldSyncStatus />

      {groups.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.capture.none')}</CardContent></Card>}

      {groups.map((g) => (
        <div key={g.kind}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t(`field.capture.kinds.${g.kind}`)}</h3>
          <div className="space-y-2">
            {g.items.map((f) => (
              <Link key={f.id} href={`/field/capture/${f.id}?${q}`}>
                <Card className="transition-colors hover:border-primary active:bg-muted">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <span className="flex min-w-0 items-center gap-3"><ClipboardList className="h-5 w-5 shrink-0 text-muted-foreground" /><span className="truncate font-medium">{f.name}</span></span>
                    <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* recent captures for this customer */}
      <div>
        <h3 className="mb-2 font-semibold">{t('field.capture.history')}</h3>
        {history.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('field.capture.noHistory')}</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <Card key={h.id}><CardContent className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="min-w-0"><span className="block truncate font-medium">{h.formName || t(`field.capture.kinds.${h.kind}`)}</span><span className="text-xs text-muted-foreground" dir="ltr">{new Date(h.createdAt).toLocaleString()}</span></span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">{t(`field.capture.kinds.${h.kind}`)}</Badge>
                  {h.score != null && <Badge variant="outline">{t('field.capture.score')}: {h.score}</Badge>}
                </span>
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
