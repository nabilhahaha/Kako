import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { ApprovalsManager } from './approvals-manager';
import { loadActionableTasks } from '../requests/data';

/** ── My Approvals (generic workflow inbox) ─────────────────────────────────
 *  The pending workflow tasks the current user can act on. Engine-driven and
 *  entity-agnostic — any module's approvals appear here. Shares its loader with
 *  the Request & Approval Center (/requests). */
export default async function ApprovalsPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const isCompanyAdmin = ctx.memberships.some((m) => m.role === 'admin');
  const supabase = await createClient();
  const rows = await loadActionableTasks(supabase, { userId: ctx.userId, isCompanyAdmin });

  return (
    <div>
      <PageHeader title={t('workflow.title')} description={t('workflow.subtitle')} />
      <ApprovalsManager tasks={rows} />
    </div>
  );
}
