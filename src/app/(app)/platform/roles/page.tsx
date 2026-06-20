import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { ModulePage } from '@/components/admin/module-page';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { ALL_PERMISSIONS, PERMISSION_LABELS, PERMISSION_GROUP_LABELS, type Permission } from '@/lib/erp/permissions';
import { RolesManager, type RoleRow, type PermMeta } from './roles-manager';

export const dynamic = 'force-dynamic';

/** Platform → Global Roles & Permissions. The role catalog (erp_roles) and its
 *  default permissions that seed every new company. Owner-only. */
export default async function PlatformRolesPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  if (!ctx.isPlatformOwner) {
    return (
      <ModulePage title={t('platform.roles.title')}>
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('platform.ownerOnly')}</CardContent></Card>
      </ModulePage>
    );
  }

  const supabase = await createClient();
  const [{ data: rolesRaw }, { data: permsRaw }] = await Promise.all([
    supabase.from('erp_roles').select('key, name_ar, is_system, rank').order('rank', { ascending: false }),
    supabase.from('erp_role_permissions').select('role_key, permission'),
  ]);

  const byRole = new Map<string, string[]>();
  for (const r of (permsRaw ?? []) as { role_key: string; permission: string }[]) {
    const arr = byRole.get(r.role_key) ?? [];
    arr.push(r.permission);
    byRole.set(r.role_key, arr);
  }

  const roles: RoleRow[] = ((rolesRaw ?? []) as { key: string; name_ar: string; is_system: boolean; rank: number }[]).map((r) => ({
    key: r.key, nameAr: r.name_ar, isSystem: r.is_system, rank: r.rank,
    permissions: byRole.get(r.key) ?? [],
  }));

  // Permission catalog (grouped) from the source-of-truth code maps.
  const perms: PermMeta[] = (ALL_PERMISSIONS as Permission[]).map((p) => ({
    key: p, en: PERMISSION_LABELS[p].en, ar: PERMISSION_LABELS[p].ar, group: PERMISSION_LABELS[p].group,
  }));
  const groups = Object.entries(PERMISSION_GROUP_LABELS).map(([key, label]) => ({ key, en: label.en, ar: label.ar }));

  return (
    <ModulePage title={t('platform.roles.title')} subtitle={t('platform.roles.description')}>
      <RolesManager roles={roles} perms={perms} groups={groups} />
    </ModulePage>
  );
}
