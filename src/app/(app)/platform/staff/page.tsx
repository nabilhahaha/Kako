import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getPlatformContext, hasPlatformPermission } from '@/lib/erp/platform-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { StaffManager, type StaffRow, type RoleDefault, type OverrideRow } from './staff-manager';

/** ── Platform Staff Management ─────────────────────────────────────────────
 *  Owner or a manage_users employee. Lists internal employees with their role,
 *  status and effective permissions; supports invite (owner), role change,
 *  per-employee overrides, and offboarding. */
export default async function PlatformStaffPage() {
  const { t } = await getT();
  const ctx = await getPlatformContext();
  if (!ctx) redirect('/login');

  if (!hasPlatformPermission(ctx, 'manage_users')) {
    return (
      <div>
        <PageHeader title={t('platformStaff.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('platformStaff.ownerOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: staff }, { data: rolePerms }, { data: overrides }] = await Promise.all([
    supabase
      .from('erp_platform_staff')
      .select('id, profile_id, role, title, is_active, created_at')
      .order('created_at', { ascending: true }),
    supabase.from('erp_platform_role_permissions').select('role, permission'),
    supabase.from('erp_platform_staff_permissions').select('staff_id, permission, effect'),
  ]);

  type Raw = { id: string; profile_id: string; role: string; title: string | null; is_active: boolean };
  const raw = (staff as Raw[] | null) ?? [];
  const profileIds = raw.map((r) => r.profile_id);
  const { data: profiles } = profileIds.length
    ? await supabase.from('erp_profiles').select('id, email, full_name').in('id', profileIds)
    : { data: [] as { id: string; email: string | null; full_name: string | null }[] };
  const pById = new Map(
    ((profiles as { id: string; email: string | null; full_name: string | null }[]) ?? []).map((p) => [p.id, p]),
  );

  // ── Last activity ──────────────────────────────────────────────────────────
  // erp_profiles has no last_sign_in_at, and auth.users is not reachable from
  // this RLS-scoped client, so we derive "last active" from the most recent
  // erp_audit_logs entry whose actor_id matches the staff member's profile id
  // (verified columns: actor_id, created_at in migration 0024). Best-effort: a
  // query error simply leaves everyone as "Never".
  const lastActiveByProfile: Record<string, string> = {};
  if (profileIds.length) {
    const { data: actorLogs } = await supabase
      .from('erp_audit_logs')
      .select('actor_id, created_at')
      .in('actor_id', profileIds)
      .order('created_at', { ascending: false })
      .limit(2000);
    for (const log of (actorLogs as { actor_id: string | null; created_at: string }[]) ?? []) {
      if (!log.actor_id) continue;
      // rows newest-first → first seen per actor is the latest
      if (!lastActiveByProfile[log.actor_id]) lastActiveByProfile[log.actor_id] = log.created_at;
    }
  }

  const staffRows: StaffRow[] = raw.map((r) => {
    const p = pById.get(r.profile_id);
    return {
      id: r.id, role: r.role, title: r.title, isActive: r.is_active,
      email: p?.email ?? null, fullName: p?.full_name ?? null,
      lastActiveAt: lastActiveByProfile[r.profile_id] ?? null,
    };
  });

  return (
    <div>
      <PageHeader title={t('platformStaff.title')} description={t('platformStaff.subtitle')} />
      <Suspense fallback={null}>
        <StaffManager
          staff={staffRows}
          roleDefaults={(rolePerms as RoleDefault[]) ?? []}
          overrides={(overrides as OverrideRow[]) ?? []}
          canInvite={ctx.isOwner}
        />
      </Suspense>
    </div>
  );
}
