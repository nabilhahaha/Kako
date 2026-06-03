import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getPlatformContext, hasPlatformPermission } from '@/lib/erp/platform-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { Company } from '@/lib/erp/types';
import { getT } from '@/lib/i18n/server';
import { AuditLog, type AuditRow } from './audit-log';

/** Audit log — server fetches a bounded window; the client component handles
 *  search, filtering and readable rendering. Server-side pagination is a future
 *  gap (see audit-log.tsx note). */
export default async function AuditLogPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const pctx = await getPlatformContext();

  if (!ctx.isPlatformOwner && !ctx.isSuperAdmin && !hasPlatformPermission(pctx, 'access_audit_logs')) {
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
      .limit(500),
    supabase.from('erp_companies').select('id, name, name_ar'),
  ]);

  const rows = (logs as AuditRow[]) ?? [];
  const companyNames: Record<string, string> = {};
  for (const c of (companies as Pick<Company, 'id' | 'name' | 'name_ar'>[]) ?? []) {
    companyNames[c.id] = c.name_ar || c.name;
  }

  return (
    <div>
      <PageHeader
        title={t('platform.audit.title')}
        description={t('platform.audit.description')}
      />
      <AuditLog rows={rows} companyNames={companyNames} />
    </div>
  );
}
