import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { ApprovalsManager, type TaskRow } from './approvals-manager';

/** ── My Approvals (generic workflow inbox) ─────────────────────────────────
 *  Lists the pending workflow tasks the current user can act on. Engine-driven
 *  and entity-agnostic — any module's approvals appear here. */
export default async function ApprovalsPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const isCompanyAdmin = ctx.memberships.some((m) => m.role === 'admin');
  const supabase = await createClient();

  const { data: tasks } = await supabase
    .from('erp_workflow_tasks')
    .select('id, step_no, assignee_type, assignee_ref, created_at, due_at, escalated_at, instance:erp_workflow_instances!instance_id(entity, record_id, definition_id)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  type Raw = {
    id: string; step_no: number; assignee_type: string; assignee_ref: string | null; created_at: string;
    due_at: string | null; escalated_at: string | null;
    instance: { entity: string; record_id: string } | { entity: string; record_id: string }[] | null;
  };
  const raw = (tasks as Raw[] | null) ?? [];

  // Only tasks this user can act on (company admin tasks, or assigned to them).
  const actionable = raw.filter((r) =>
    (r.assignee_type === 'company_admin' && isCompanyAdmin) ||
    (r.assignee_type === 'user' && r.assignee_ref === ctx.userId),
  );

  // Resolve customer names for nicer labels.
  const inst = (r: Raw) => (Array.isArray(r.instance) ? r.instance[0] : r.instance);
  const customerIds = actionable
    .map((r) => inst(r)).filter((i) => i?.entity === 'customer').map((i) => i!.record_id);
  const nameById = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('erp_customers').select('id, name, name_ar').in('id', customerIds);
    for (const c of (cust as { id: string; name: string; name_ar: string | null }[]) ?? [])
      nameById.set(c.id, c.name_ar || c.name);
  }

  const rows: TaskRow[] = actionable.map((r) => {
    const i = inst(r);
    return {
      id: r.id, entity: i?.entity ?? '', recordId: i?.record_id ?? '',
      recordLabel: (i?.entity === 'customer' ? nameById.get(i?.record_id ?? '') : '') || (i?.record_id ?? ''),
      stepNo: r.step_no, createdAt: r.created_at,
      overdue: r.due_at != null && new Date(r.due_at).getTime() < Date.now(),
      escalated: r.escalated_at != null,
    };
  });

  return (
    <div>
      <PageHeader title={t('workflow.title')} description={t('workflow.subtitle')} />
      <ApprovalsManager tasks={rows} />
    </div>
  );
}
