import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { listEntities } from '@/lib/erp/entities';
import { loadAuthzConsole } from '@/lib/erp/authz-console-server';
import { loadRoleOverridesConsole } from '@/lib/erp/role-overrides-server';
import { loadAccessOverridesConsole } from '@/lib/erp/access-overrides-server';
import { DELEGABLE_OPERATIONAL_PERMISSIONS, groupOperationalPermissions } from '@/lib/role-governance';
import { RolesWorkbench } from './roles-workbench';

/**
 * VANTORA Authorization Console — /settings/authz.
 *
 * The long-term authorization administration surface. Gated to Company Admins
 * (a membership with role === 'admin') and the Platform Owner ONLY — the same
 * gate every server action enforces (requireCompanyAdmin). It deliberately does
 * NOT gate on the generic `manager` role or any coarse permission.
 */
export default async function AuthzConsolePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const isAdmin = ctx.isPlatformOwner === true || ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title={t('authz.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('authz.adminOnly')}</CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const data = await loadAuthzConsole(supabase, ctx);

  // Entities that declare a field catalog → candidates for section-access.
  const entities = listEntities()
    .filter((e) => (e.fields?.length ?? 0) > 0)
    .map((e) => ({ key: e.key, labelAr: e.labelAr, labelEn: e.labelEn }));

  // Authorization overrides (reused as workbench tabs) — gating decided server-side.
  const [roleOv, uao] = await Promise.all([
    loadRoleOverridesConsole(supabase, ctx),
    loadAccessOverridesConsole(supabase, ctx),
  ]);
  const groups = groupOperationalPermissions(DELEGABLE_OPERATIONAL_PERMISSIONS);

  return (
    <div>
      <PageHeader title={t('authz.title')} description={t('authz.description')} />
      <RolesWorkbench
        data={data}
        entities={entities}
        groups={groups}
        roleOverridesEnabled={roleOv.enabled}
        uaoEnabled={uao.enabled}
        uaoMembers={uao.members}
      />
    </div>
  );
}
