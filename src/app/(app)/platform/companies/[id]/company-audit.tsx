import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ScrollText } from 'lucide-react';
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS } from '@/lib/erp/audit';

export interface CompanyAuditRow {
  id: string;
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
}

const DESTRUCTIVE = new Set(['delete', 'revoke', 'disable', 'deactivate']);

/** Per-company audit trail (read-only). Owner-scoped; rows are already filtered
 *  to this company by the page query. */
export function CompanyAudit({
  rows,
  locale,
  labels,
}: {
  rows: CompanyAuditRow[];
  locale: 'ar' | 'en';
  labels: { empty: string; time: string; actor: string; action: string; entity: string };
}) {
  if (rows.length === 0) {
    return <EmptyState icon={<ScrollText />} title={labels.empty} />;
  }
  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  };
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="p-3 text-start font-medium">{labels.time}</th>
                <th className="p-3 text-start font-medium">{labels.actor}</th>
                <th className="p-3 text-start font-medium">{labels.action}</th>
                <th className="p-3 text-start font-medium">{labels.entity}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="p-3 text-muted-foreground" dir="ltr">{fmt(r.created_at)}</td>
                  <td className="p-3" dir="ltr">{r.actor_email ?? '—'}</td>
                  <td className="p-3">
                    <Badge variant={DESTRUCTIVE.has(r.action) ? 'destructive' : 'secondary'}>
                      {AUDIT_ACTION_LABELS[r.action]?.[locale] ?? r.action}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {AUDIT_ENTITY_LABELS[r.entity]?.[locale] ?? r.entity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
