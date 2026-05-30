import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { PermissionsMatrix, type RoleRow } from './permissions-matrix';

export default async function PermissionsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  const supabase = await createClient();
  const [{ data: roles }, { data: rolePerms }] = await Promise.all([
    supabase.from('erp_roles').select('key, name_ar, is_system, rank').order('rank', { ascending: false }),
    supabase.from('erp_role_permissions').select('role_key, permission'),
  ]);

  const permsByRole: Record<string, string[]> = {};
  for (const rp of rolePerms ?? []) {
    (permsByRole[rp.role_key] ??= []).push(rp.permission);
  }

  return (
    <div>
      <PageHeader
        title={t('settings.permissions.pageTitle')}
        description={t('settings.permissions.pageDescription')}
      />
      <PermissionsMatrix
        roles={(roles as RoleRow[]) ?? []}
        permsByRole={permsByRole}
        canEdit={ctx.isSuperAdmin}
      />
    </div>
  );
}
