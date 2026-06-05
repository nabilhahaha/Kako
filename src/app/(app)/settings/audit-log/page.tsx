import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import {
  describeAuditEvent, AUDIT_ACTION_LABELS, AUDIT_DESTRUCTIVE_ACTIONS, type AuditEventLike,
} from '@/lib/erp/audit';

export const dynamic = 'force-dynamic';

interface AuditRow extends AuditEventLike {
  id: string;
  created_at: string;
}

/** Tenant Audit Viewer — a company admin reviews their OWN company's audit trail.
 *  RLS (migration 0153) restricts rows to the caller's company + company-admin;
 *  we also gate the page by the settings.users permission. Read-only. */
export default async function SettingsAuditLogPage() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  if (!hasPermission(ctx, 'settings.users')) {
    return (
      <div>
        <PageHeader title={t('settings.audit.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('settings.audit.adminOnly')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_audit_logs')
    .select('id, actor_email, action, entity, entity_id, details, company_id, created_at')
    .eq('company_id', ctx.companyId)
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = (data ?? []) as AuditRow[];
  const intlLocale = locale === 'ar' ? 'ar-EG' : 'en-US';

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.audit.title')} description={t('settings.audit.description')} />

      {rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('settings.audit.empty')}</CardContent></Card>
      ) : (
        <Card><CardContent className="divide-y p-0">
          {rows.map((r) => {
            const destructive = AUDIT_DESTRUCTIVE_ACTIONS.has(r.action);
            return (
              <div key={r.id} className="flex items-start gap-3 p-3">
                <Badge variant={destructive ? 'destructive' : 'secondary'} className="shrink-0">
                  {AUDIT_ACTION_LABELS[r.action]?.[locale] ?? r.action}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{describeAuditEvent(r, { locale })}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(r.created_at, intlLocale)}
                    {r.actor_email ? ` · ${r.actor_email}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent></Card>
      )}
    </div>
  );
}
