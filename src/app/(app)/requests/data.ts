import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TaskRow } from '../approvals/approvals-manager';

/** Shared loaders for the Request & Approval Center. The generic workflow engine
 *  (erp_workflow_instances / _tasks / _definitions) is reused as-is; these
 *  helpers just shape it into the Center's three views. RLS already scopes every
 *  query to the caller's company. */

export interface RequestRow {
  id: string;
  entity: string;
  recordId: string;
  defNameAr: string | null;
  defNameEn: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  currentStep: number;
  myDecision?: 'approved' | 'rejected' | null;
}

type InstanceRaw = {
  id: string; entity: string; record_id: string; status: string;
  current_step: number; started_at: string; completed_at: string | null;
  definition: { name_ar: string | null; name_en: string | null } | { name_ar: string | null; name_en: string | null }[] | null;
};

const INSTANCE_SELECT =
  'id, entity, record_id, status, current_step, started_at, completed_at, definition:erp_workflow_definitions!definition_id(name_ar, name_en)';

function mapInstance(r: InstanceRaw, myDecision?: 'approved' | 'rejected' | null): RequestRow {
  const d = Array.isArray(r.definition) ? r.definition[0] : r.definition;
  return {
    id: r.id, entity: r.entity, recordId: r.record_id,
    defNameAr: d?.name_ar ?? null, defNameEn: d?.name_en ?? null,
    status: r.status, startedAt: r.started_at, completedAt: r.completed_at,
    currentStep: r.current_step, myDecision: myDecision ?? null,
  };
}

/** Pending tasks the current user can act on (the "My Approvals" inbox). Shared
 *  with the standalone /approvals route so the logic lives in one place. */
export async function loadActionableTasks(
  supabase: SupabaseClient,
  opts: { userId: string; isCompanyAdmin: boolean },
): Promise<TaskRow[]> {
  const { data } = await supabase
    .from('erp_workflow_tasks')
    .select('id, step_no, assignee_type, assignee_ref, created_at, due_at, escalated_at, instance:erp_workflow_instances!instance_id(entity, record_id)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  type Raw = {
    id: string; step_no: number; assignee_type: string; assignee_ref: string | null; created_at: string;
    due_at: string | null; escalated_at: string | null;
    instance: { entity: string; record_id: string } | { entity: string; record_id: string }[] | null;
  };
  const raw = (data as Raw[] | null) ?? [];
  const inst = (r: Raw) => (Array.isArray(r.instance) ? r.instance[0] : r.instance);

  const actionable = raw.filter((r) =>
    (r.assignee_type === 'company_admin' && opts.isCompanyAdmin) ||
    (r.assignee_type === 'user' && r.assignee_ref === opts.userId),
  );

  // Friendly labels for customer-entity tasks.
  const customerIds = actionable.map(inst).filter((i) => i?.entity === 'customer').map((i) => i!.record_id);
  const nameById = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('erp_customers').select('id, name, name_ar').in('id', customerIds);
    for (const c of (cust as { id: string; name: string; name_ar: string | null }[]) ?? [])
      nameById.set(c.id, c.name_ar || c.name);
  }

  return actionable.map((r) => {
    const i = inst(r);
    return {
      id: r.id, entity: i?.entity ?? '', recordId: i?.record_id ?? '',
      recordLabel: (i?.entity === 'customer' ? nameById.get(i?.record_id ?? '') : '') || (i?.record_id ?? ''),
      stepNo: r.step_no, createdAt: r.created_at,
      overdue: r.due_at != null && new Date(r.due_at).getTime() < Date.now(),
      escalated: r.escalated_at != null,
    };
  });
}

/** Requests the current user submitted (started), newest first. */
export async function loadMyRequests(supabase: SupabaseClient, userId: string): Promise<RequestRow[]> {
  const { data } = await supabase
    .from('erp_workflow_instances')
    .select(INSTANCE_SELECT)
    .eq('started_by', userId)
    .order('started_at', { ascending: false })
    .limit(100);
  return ((data as InstanceRaw[] | null) ?? []).map((r) => mapInstance(r));
}

/** Completed requests the user was involved in (started or decided on). */
export async function loadRequestHistory(supabase: SupabaseClient, userId: string): Promise<RequestRow[]> {
  const { data: started } = await supabase
    .from('erp_workflow_instances')
    .select(INSTANCE_SELECT)
    .eq('started_by', userId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(100);

  const { data: myTasks } = await supabase
    .from('erp_workflow_tasks')
    .select('instance_id, status')
    .eq('decided_by', userId)
    .not('decided_at', 'is', null)
    .limit(200);
  const decisionByInstance = new Map<string, 'approved' | 'rejected' | null>();
  for (const tRow of (myTasks as { instance_id: string; status: string }[] | null) ?? []) {
    decisionByInstance.set(tRow.instance_id, tRow.status === 'approved' ? 'approved' : tRow.status === 'rejected' ? 'rejected' : null);
  }

  const byId = new Map<string, RequestRow>();
  for (const r of (started as InstanceRaw[] | null) ?? []) byId.set(r.id, mapInstance(r));

  const actedIds = [...decisionByInstance.keys()].filter((id) => !byId.has(id));
  if (actedIds.length > 0) {
    const { data: acted } = await supabase
      .from('erp_workflow_instances')
      .select(INSTANCE_SELECT)
      .in('id', actedIds)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false });
    for (const r of (acted as InstanceRaw[] | null) ?? [])
      byId.set(r.id, mapInstance(r, decisionByInstance.get(r.id)));
  }

  return [...byId.values()].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}
