import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadRoleOverridesConsole } from '@/lib/erp/role-overrides-server';
import { DELEGABLE_OPERATIONAL_PERMISSIONS, groupOperationalPermissions } from '@/lib/role-governance';
import { RoleOverridesConsole } from './role-overrides-console';

export const dynamic = 'force-dynamic';

/**
 * Role Permission Overrides — /settings/role-overrides (R3). Admin-gated; the
 * feature is default-OFF (flag KAKO_ROLE_PERMISSION_OVERRIDES AND per-company
 * entitlement). When off, an inert state is shown and the editor is not rendered.
 */
export default async function RoleOverridesPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const isAdmin =
    ctx.isPlatformOwner === true || ctx.isSuperAdmin === true || ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title={t('roleOverrides.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('authz.adminOnly')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const data = await loadRoleOverridesConsole(supabase, ctx);

  if (!data.enabled) {
    return (
      <div>
        <PageHeader title={t('roleOverrides.title')} />
        <Card>
          <CardContent className="space-y-1 p-8 text-center">
            <p className="font-medium">{t('roleOverrides.disabledTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('roleOverrides.disabledBody')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const groups = groupOperationalPermissions(DELEGABLE_OPERATIONAL_PERMISSIONS);

  return (
    <div>
      <PageHeader title={t('roleOverrides.title')} description={t('roleOverrides.description')} />
      <RoleOverridesConsole roles={data.roles} groups={groups} />
    </div>
  );
}
