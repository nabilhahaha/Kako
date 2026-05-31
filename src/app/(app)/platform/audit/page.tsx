import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS } from '@/lib/erp/audit';
import type { Company } from '@/lib/erp/types';
import { getT } from '@/lib/i18n/server';

interface AuditRow {
  id: string;
  actor_email: string | null;
  company_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const DESTRUCTIVE = new Set(['delete', 'revoke', 'disable', 'deactivate']);

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar-EG', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default async function AuditLogPage() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  if (!ctx.isPlatformOwner && !ctx.isSuperAdmin) {
    return (
      <div>
        <PageHeader title={t('platform.audit.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('platform.ownerOrSuperAdminOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: logs }, { data: companies }] = await Promise.all([
    supabase
      .from('erp_audit_logs')
      .select('id, actor_email, company_id, action, entity, entity_id, details, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('erp_companies').select('id, name, name_ar'),
  ]);

  const rows = (logs as AuditRow[]) ?? [];
  const companyName = new Map(
    ((companies as Pick<Company, 'id' | 'name' | 'name_ar'>[]) ?? []).map((c) => [
      c.id,
      c.name_ar || c.name,
    ]),
  );

  return (
    <div>
      <PageHeader
        title={t('platform.audit.title')}
        description={t('platform.audit.description')}
      />
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('platform.audit.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium whitespace-nowrap">{t('platform.audit.thTime')}</th>
                    <th className="p-3 text-start font-medium">{t('platform.audit.thActor')}</th>
                    <th className="p-3 text-start font-medium">{t('platform.audit.thAction')}</th>
                    <th className="p-3 text-start font-medium">{t('platform.audit.thEntity')}</th>
                    <th className="p-3 text-start font-medium">{t('platform.audit.thCompany')}</th>
                    <th className="p-3 text-start font-medium">{t('platform.audit.thDetails')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b align-top">
                      <td className="p-3 whitespace-nowrap text-muted-foreground" dir="ltr">{fmtTime(r.created_at)}</td>
                      <td className="p-3" dir="ltr">{r.actor_email ?? '—'}</td>
                      <td className="p-3">
                        <Badge variant={DESTRUCTIVE.has(r.action) ? 'destructive' : 'secondary'}>
                          {AUDIT_ACTION_LABELS[r.action]?.[locale] ?? r.action}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {AUDIT_ENTITY_LABELS[r.entity]?.[locale] ?? r.entity}
                        {r.entity_id && (
                          <span className="block text-xs text-muted-foreground" dir="ltr">{r.entity_id}</span>
                        )}
                      </td>
                      <td className="p-3">{r.company_id ? companyName.get(r.company_id) ?? '—' : '—'}</td>
                      <td className="p-3 text-xs text-muted-foreground" dir="ltr">
                        {r.details ? JSON.stringify(r.details) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
