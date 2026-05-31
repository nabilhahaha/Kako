import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { Branch, Profile, UserBranch } from '@/lib/erp/types';
import { getT } from '@/lib/i18n/server';
import { UsersManager } from './users-manager';

export default async function UsersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  if (!ctx.isSuperAdmin) {
    return (
      <div>
        <PageHeader title={t('settings.users.pageTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('settings.users.superAdminOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: profiles }, { data: branches }, { data: assignments }, { data: roles }] =
    await Promise.all([
      supabase.from('erp_profiles').select('*').order('created_at'),
      supabase
        .from('erp_branches')
        .select('*')
        .eq('is_active', true)
        .order('code'),
      supabase.from('erp_user_branches').select('*'),
      supabase.from('erp_roles').select('key, name_ar').order('rank', { ascending: false }),
    ]);

  return (
    <div>
      <PageHeader
        title={t('settings.users.pageTitle')}
        description={t('settings.users.pageDescription')}
      />
      <UsersManager
        currentUserId={ctx.userId}
        profiles={(profiles as Profile[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        assignments={(assignments as UserBranch[]) ?? []}
        roles={(roles as { key: string; name_ar: string }[]) ?? []}
      />
    </div>
  );
}
