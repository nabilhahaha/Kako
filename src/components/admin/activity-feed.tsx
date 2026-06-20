'use client';

import { useEffect, useState, useTransition } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ContextLink } from './context-panel';
import { loadEntityAudit, type AuditFeedRow } from './audit-feed-actions';

/**
 * ActivityFeed — reusable right-panel live audit feed for the Admin Workbench.
 * Fetches the selected entity's recent audit rows (read-only) and renders them,
 * with a deep link to the full Audit Log. Every workbench inherits it.
 */
export function ActivityFeed({
  entityId,
  entities,
  auditHref = '/settings/audit-log',
}: {
  entityId: string | null;
  entities?: string[];
  auditHref?: string;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<AuditFeedRow[]>([]);
  const [loading, start] = useTransition();

  useEffect(() => {
    if (!entityId) { setRows([]); return; }
    start(async () => setRows(await loadEntityAudit(entityId, entities)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, JSON.stringify(entities)]);

  return (
    <div className="space-y-2">
      {loading && rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('adminWb.noActivity')}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const detail = (r.details?.permission as string) ?? (r.details?.role as string) ?? r.entity;
            return (
              <li key={r.id} className="text-xs">
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">{r.action}</Badge>
                  <span className="min-w-0 truncate text-muted-foreground" dir="ltr">{detail}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {formatDate(r.created_at)}{r.actor_email ? ` · ${r.actor_email}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <ContextLink href={auditHref} label={t('adminWb.viewAudit')} />
    </div>
  );
}
