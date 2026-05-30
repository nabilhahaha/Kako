import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { StaffManager, type StaffMember, type RoleOption } from './staff-manager';

export default async function StaffPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  const selfBlocked = ctx.company ? ctx.company.allow_self_users === false : false;
  if (!hasPermission(ctx, 'settings.users') || !ctx.companyId || selfBlocked) {
    return (
      <div>
        <PageHeader title={t('settings.staff.pageTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {!ctx.companyId
              ? t('settings.staff.noCompany')
              : selfBlocked
                ? t('settings.staff.providerManaged')
                : t('settings.staff.managerOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: staff }, { data: roles }] = await Promise.all([
    supabase.rpc('erp_company_staff'),
    supabase.from('erp_roles').select('key, name_ar').order('rank', { ascending: false }),
  ]);

  return (
    <div>
      <PageHeader title={t('settings.staff.pageTitle')} description={t('settings.staff.pageDescription')} />
      <StaffManager
        currentUserId={ctx.userId}
        staff={((staff as StaffMember[]) ?? []).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'ar'))}
        roles={(roles as RoleOption[]) ?? []}
      />
    </div>
  );
}
