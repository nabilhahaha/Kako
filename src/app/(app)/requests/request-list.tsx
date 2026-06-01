import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Inbox } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { RequestRow } from './data';

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'secondary' | 'info'> = {
  pending: 'info', approved: 'success', rejected: 'destructive', cancelled: 'secondary', escalated: 'warning',
};

export interface RequestListLabels {
  empty: string;
  request: string;
  statusHeader: string;
  dateHeader: string;
  stepHeader: string;
  step: string;
  statusLabels: Record<string, string>;
  entityLabel: (entity: string) => string;
}

/** Read-only table for the "My Requests" and "History" tabs. Renders any
 *  engine instance, labelled by its workflow definition. */
export function RequestList({
  rows,
  mode,
  locale,
  labels,
}: {
  rows: RequestRow[];
  mode: 'mine' | 'history';
  locale: 'ar' | 'en';
  labels: RequestListLabels;
}) {
  if (rows.length === 0) return <EmptyState icon={<Inbox />} title={labels.empty} />;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="p-3 text-start font-medium">{labels.request}</th>
                <th className="p-3 text-start font-medium">{labels.statusHeader}</th>
                <th className="p-3 text-start font-medium">{labels.dateHeader}</th>
                {mode === 'mine' && <th className="p-3 text-start font-medium">{labels.stepHeader}</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const name =
                  (locale === 'ar' ? r.defNameAr || r.defNameEn : r.defNameEn || r.defNameAr) ||
                  labels.entityLabel(r.entity);
                const when = (mode === 'history' ? r.completedAt : r.startedAt) ?? r.startedAt;
                return (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="p-3">
                      <span className="font-medium">{name}</span>{' '}
                      <span className="text-muted-foreground" dir="ltr">{r.recordId.slice(0, 8)}</span>
                    </td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[r.status] ?? 'secondary'}>
                        {labels.statusLabels[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground" dir="ltr">{formatDate(when, INTL_LOCALE[locale])}</td>
                    {mode === 'mine' && (
                      <td className="p-3 text-muted-foreground">{labels.step} {r.currentStep}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
