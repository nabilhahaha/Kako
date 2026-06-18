import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadAccessOverridesConsole } from '@/lib/erp/access-overrides-server';
import { DELEGABLE_OPERATIONAL_PERMISSIONS, groupOperationalPermissions } from '@/lib/role-governance';
import { AccessOverridesConsole } from './access-overrides-console';

export const dynamic = 'force-dynamic';

/**
 * User Access Overrides — /settings/access-overrides (E4).
 *
 * Admin-gated (Company Admin / Platform Owner / Super Admin), same as every
 * server action (requireCompanyAdmin). The feature is DEFAULT-OFF
 * (KAKO_USER_ACCESS_OVERRIDES): when off, `enabled` is false and the page shows
 * an inert state — the editor is never rendered, so no override can be created.
 * Not linked in navigation while off.
 */
export default async function AccessOverridesPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const isAdmin =
    ctx.isPlatformOwner === true || ctx.isSuperAdmin === true || ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title={t('accessOverrides.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('authz.adminOnly')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const data = await loadAccessOverridesConsole(supabase, ctx);

  if (!data.enabled) {
    return (
      <div>
        <PageHeader title={t('accessOverrides.title')} />
        <Card>
          <CardContent className="space-y-1 p-8 text-center">
            <p className="font-medium">{t('accessOverrides.disabledTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('accessOverrides.disabledBody')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const groups = groupOperationalPermissions(DELEGABLE_OPERATIONAL_PERMISSIONS);

  return (
    <div>
      <PageHeader title={t('accessOverrides.title')} description={t('accessOverrides.description')} />
      <AccessOverridesConsole members={data.members} groups={groups} />
    </div>
  );
}
