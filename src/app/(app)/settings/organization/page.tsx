import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import type { Department, Team, JobTitle } from '@/lib/erp/types';
import {
  OrganizationManager,
  type BranchOption,
  type StaffRow,
} from './organization-manager';

export default async function OrganizationPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  const isAdmin = ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title={t('organization.pageTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('settings.branches.superAdminOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const branchIds = ctx.memberships.map((m) => m.branch.id);

  const [
    { data: departments },
    { data: teams },
    { data: jobTitles },
    { data: branches },
    { data: staffRows },
  ] = await Promise.all([
    supabase
      .from('erp_departments')
      .select('*')
      .order('name', { ascending: true }),
    supabase
      .from('erp_teams')
      .select('*')
      .order('name', { ascending: true }),
    supabase
      .from('erp_job_titles')
      .select('*')
      .order('name', { ascending: true }),
    supabase
      .from('erp_branches')
      .select('id, name, name_ar')
      .eq('company_id', ctx.companyId)
      .order('name', { ascending: true }),
    supabase
      .from('erp_user_branches')
      .select(
        'id, user_id, role, department_id, team_id, job_title_id, reports_to, profile:erp_profiles(id, full_name)',
      )
      .in('branch_id', branchIds.length > 0 ? branchIds : ['']),
  ]);

  // Normalize staff rows: the joined profile arrives as an object via the FK.
  const staff: StaffRow[] = ((staffRows as unknown[]) ?? []).map((r) => {
    const row = r as {
      id: string;
      user_id: string;
      role: string;
      department_id: string | null;
      team_id: string | null;
      job_title_id: string | null;
      reports_to: string | null;
      profile: { id: string; full_name: string | null } | null;
    };
    return {
      id: row.id,
      user_id: row.user_id,
      role: row.role,
      department_id: row.department_id,
      team_id: row.team_id,
      job_title_id: row.job_title_id,
      reports_to: row.reports_to,
      full_name: row.profile?.full_name ?? null,
    };
  });

  // Dedupe staff by user_id (a user may hold several branch memberships); keep
  // the first row so each employee appears once in the assignment list.
  const seen = new Set<string>();
  const uniqueStaff = staff.filter((s) => {
    if (seen.has(s.user_id)) return false;
    seen.add(s.user_id);
    return true;
  });

  return (
    <div>
      <PageHeader
        title={t('organization.pageTitle')}
        description={t('organization.pageDescription')}
      />
      <OrganizationManager
        departments={(departments as Department[]) ?? []}
        teams={(teams as Team[]) ?? []}
        jobTitles={(jobTitles as JobTitle[]) ?? []}
        branches={(branches as BranchOption[]) ?? []}
        staff={uniqueStaff}
      />
    </div>
  );
}
