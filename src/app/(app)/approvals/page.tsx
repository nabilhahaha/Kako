import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { ApprovalsManager, type TaskRow } from './approvals-manager';
import { DEFAULT_PAGE_SIZE, param, pageNumber, rangeFor, type SearchParams } from '@/lib/list-params';

/** ── Workflow Inbox (generic approvals) ───────────────────────────────────
 *  Lists the workflow tasks the current user can act on, across every module.
 *  Engine-driven and entity-agnostic — any module's approvals surface here.
 *
 *  Phase-5: a true "inbox". Pending tasks (T1 attention) are surfaced with a
 *  prominent count and ordered oldest-first (most-urgent). Status / type /
 *  search filters and pagination are driven from `searchParams` so the view is
 *  shareable, refresh-safe and deep-linkable. Each row reads as a plain-language
 *  sentence (who requested approval of what) rather than raw ids. */
export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const isCompanyAdmin = ctx.memberships.some((m) => m.role === 'admin');

  const sp = (await searchParams) ?? {};
  const page = pageNumber(sp);
  const pageSize = DEFAULT_PAGE_SIZE;
  const q = (param(sp, 'q') ?? '').trim();
  const status = param(sp, 'status') ?? 'pending'; // pending | approved | rejected | all
  const entityFilter = param(sp, 'entity') ?? 'all';

  const supabase = await createClient();

  const SELECT =
    'id, step_no, status, assignee_type, assignee_ref, created_at, decided_at, due_at, escalated_at, comment, ' +
    'instance:erp_workflow_instances!instance_id(entity, record_id, company_id, started_by)';

  type Raw = {
    id: string;
    step_no: number;
    status: string;
    assignee_type: string;
    assignee_ref: string | null;
    created_at: string;
    decided_at: string | null;
    due_at: string | null;
    escalated_at: string | null;
    comment: string | null;
    instance:
      | { entity: string; record_id: string; company_id: string; started_by: string | null }
      | { entity: string; record_id: string; company_id: string; started_by: string | null }[]
      | null;
  };
  const inst = (r: Raw) => (Array.isArray(r.instance) ? r.instance[0] : r.instance);

  // Only the statuses the engine records on a task. "all" = decided + pending.
  const STATUS_VALUES = ['pending', 'approved', 'rejected'];

  // Fetch a bounded working set; "actionable" scoping (own tasks / company-admin
  // tasks) and entity/search filtering happen in-memory because the assignee
  // predicate can't be expressed in a single RLS-safe query. Pagination is then
  // applied to the filtered set. The window is generous for an approvals inbox.
  let base = supabase
    .from('erp_workflow_tasks')
    .select(SELECT)
    // Pending oldest-first (most-urgent first, T1); decided rows newest-first.
    .order('status', { ascending: true })
    .order('created_at', { ascending: status === 'pending' ? true : false });

  if (status !== 'all' && STATUS_VALUES.includes(status)) base = base.eq('status', status);
  else base = base.in('status', STATUS_VALUES);

  const { data } = await base.limit(2000);
  const all = (data as Raw[] | null) ?? [];

  // Tasks this user can act on / has acted on: company-admin tasks (when admin)
  // or tasks assigned directly to the user.
  const actionable = all.filter(
    (r) =>
      (r.assignee_type === 'company_admin' && isCompanyAdmin) ||
      (r.assignee_type === 'user' && r.assignee_ref === ctx.userId),
  );

  // Resolve display names for requester (profile) and company.
  const requesterIds = Array.from(
    new Set(actionable.map((r) => inst(r)?.started_by).filter((v): v is string => !!v)),
  );
  const companyIds = Array.from(
    new Set(actionable.map((r) => inst(r)?.company_id).filter((v): v is string => !!v)),
  );
  const customerIds = actionable
    .map((r) => inst(r))
    .filter((i) => i?.entity === 'customer')
    .map((i) => i!.record_id);

  const requesterById = new Map<string, string>();
  const companyById = new Map<string, string>();
  const recordNameById = new Map<string, string>();
  await Promise.all([
    requesterIds.length
      ? supabase
          .from('erp_profiles')
          .select('id, full_name')
          .in('id', requesterIds)
          .then(({ data }) => {
            for (const p of (data as { id: string; full_name: string | null }[]) ?? [])
              if (p.full_name) requesterById.set(p.id, p.full_name);
          })
      : Promise.resolve(),
    companyIds.length
      ? supabase
          .from('erp_companies')
          .select('id, name, name_ar')
          .in('id', companyIds)
          .then(({ data }) => {
            for (const c of (data as { id: string; name: string; name_ar: string | null }[]) ?? [])
              companyById.set(c.id, c.name);
          })
      : Promise.resolve(),
    customerIds.length
      ? supabase
          .from('erp_customers')
          .select('id, name, name_ar')
          .in('id', customerIds)
          .then(({ data }) => {
            for (const c of (data as { id: string; name: string; name_ar: string | null }[]) ?? [])
              recordNameById.set(c.id, c.name_ar || c.name);
          })
      : Promise.resolve(),
  ]);

  // Map to view rows, then apply entity + search filters in-memory.
  const mapped: TaskRow[] = actionable.map((r) => {
    const i = inst(r);
    const recordLabel =
      (i?.entity === 'customer' ? recordNameById.get(i?.record_id ?? '') : '') || (i?.record_id ?? '');
    return {
      id: r.id,
      entity: i?.entity ?? '',
      recordId: i?.record_id ?? '',
      recordLabel,
      requester: (i?.started_by && requesterById.get(i.started_by)) || '',
      company: (i?.company_id && companyById.get(i.company_id)) || '',
      status: (r.status as TaskRow['status']) ?? 'pending',
      stepNo: r.step_no,
      createdAt: r.created_at,
      decidedAt: r.decided_at,
      comment: r.comment,
      overdue: r.due_at != null && r.status === 'pending' && new Date(r.due_at).getTime() < Date.now(),
      escalated: r.escalated_at != null && r.status === 'pending',
    };
  });

  // Distinct entity values for the type filter (from the actionable set).
  const entityOptions = Array.from(new Set(mapped.map((r) => r.entity).filter(Boolean))).sort();

  let filtered = mapped;
  if (entityFilter !== 'all') filtered = filtered.filter((r) => r.entity === entityFilter);
  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.recordLabel.toLowerCase().includes(needle) ||
        r.requester.toLowerCase().includes(needle) ||
        r.company.toLowerCase().includes(needle) ||
        r.entity.toLowerCase().includes(needle),
    );
  }

  // Pending count is independent of the active filters (T1 attention metric).
  const pendingTotal = mapped.filter((r) => r.status === 'pending').length;

  const total = filtered.length;
  const [from, to] = rangeFor(page, pageSize);
  const rows = filtered.slice(from, to + 1);

  return (
    <div>
      <PageHeader title={t('workflow.title')} description={t('workflow.subtitle')} />
      <Suspense fallback={null}>
        <ApprovalsManager
          tasks={rows}
          total={total}
          pendingTotal={pendingTotal}
          page={page}
          pageSize={pageSize}
          filters={{ q, status, entity: entityFilter }}
          entityOptions={entityOptions}
        />
      </Suspense>
    </div>
  );
}
