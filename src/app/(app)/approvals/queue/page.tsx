import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { canSeeWorkflowInbox } from '@/lib/erp/approvals-access';
import { UNIFIED_INBOX } from '@/lib/erp/approval-flags';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { ApprovalQueue, type ApprovalItem, type ApprovalType } from './approval-queue';
import { ApprovalsTabs } from '../approvals-tabs';

/** Engine workflow entity → friendly i18n label (P3 unified inbox). */
const WF_ENTITY_LABEL: Record<string, string> = {
  credit_limit_request: 'approvalQueue.wfCreditLimit',
  trade_promotion: 'approvalQueue.wfTradeSpend',
  price_change_request: 'approvalQueue.wfPriceChange',
  customer: 'approvalQueue.wfCustomer',
  customer_change_request: 'approvalQueue.wfCustomerChange',
};

/**
 * Unified Approval Queue. Aggregates the field/commercial approval workflows that
 * were previously backend-only (day-close exception, out-of-route visit, customer
 * transfer, van transfer, trade-spend promo) into one inbox. Read-only fetch here
 * (RLS-scoped); decisions go through the existing actions via queue-actions.ts.
 * Each section is shown only when the caller holds the matching approval permission.
 */
export const dynamic = 'force-dynamic';

const LIMIT = 60;
const mapStatus = (s: string, pending: string): ApprovalItem['status'] =>
  s === pending ? 'pending' : s === 'rejected' || s === 'cancelled' ? 'rejected' : 'approved';

export default async function ApprovalQueuePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const caps: Record<ApprovalType, boolean> = {
    day_close: hasPermission(ctx, 'day.approve_close_exception'),
    visit: hasPermission(ctx, 'visit.approve_out_of_route'),
    customer_transfer: hasPermission(ctx, 'customer.transfer'),
    van_transfer: hasPermission(ctx, 'stock.transfer.approve'),
    trade_spend: hasPermission(ctx, 'reports.view'),
    // P3: engine tasks surface only when the unified inbox is enabled.
    workflow: UNIFIED_INBOX(),
  };

  const supabase = await createClient();
  const items: ApprovalItem[] = [];

  // P3 (flag KAKO_UNIFIED_INBOX): fold the engine Workflow Inbox into this one
  // queue — the tasks the caller can act on (credit-limit, trade-spend,
  // price-change, change-requests…), via the indexed erp_workflow_my_tasks().
  // Flag OFF ⇒ no engine items, behaviour identical to today.
  if (UNIFIED_INBOX()) {
    const { t } = await getT();
    const { data: myTasks } = await supabase.rpc('erp_workflow_my_tasks');
    const tasks = (myTasks as { id: string; instance_id: string; created_at: string }[] | null) ?? [];
    if (tasks.length > 0) {
      const { data: insts } = await supabase
        .from('erp_workflow_instances')
        .select('id, entity, record_id')
        .in('id', tasks.map((tk) => tk.instance_id));
      const instById = new Map(
        ((insts as { id: string; entity: string; record_id: string }[] | null) ?? []).map((i) => [i.id, i]),
      );
      for (const tk of tasks) {
        const inst = instById.get(tk.instance_id);
        const entity = inst?.entity ?? 'workflow';
        items.push({
          type: 'workflow',
          id: tk.id,
          primary: t(WF_ENTITY_LABEL[entity] ?? 'approvalQueue.type_workflow'),
          secondary: inst?.record_id ?? '',
          status: 'pending',
          requestedAt: tk.created_at ?? null,
          decidedAt: null,
          canReject: true,
        });
      }
    }
  }

  if (caps.day_close) {
    const { data } = await supabase
      .from('erp_work_sessions')
      .select('id, work_date, close_status, visited_count, planned_count')
      .in('close_status', ['pending_approval', 'closed'])
      .order('work_date', { ascending: false })
      .limit(LIMIT);
    for (const r of (data ?? []) as Array<{ id: string; work_date: string; close_status: string; visited_count: number | null; planned_count: number | null }>) {
      items.push({
        type: 'day_close', id: r.id,
        primary: r.work_date,
        secondary: `${r.visited_count ?? 0}/${r.planned_count ?? 0}`,
        status: mapStatus(r.close_status, 'pending_approval'),
        requestedAt: r.work_date, decidedAt: null, canReject: false,
      });
    }
  }

  if (caps.visit) {
    const { data } = await supabase
      .from('erp_visit_compliance')
      .select('id, kind, reason, status, created_at, decided_at')
      .in('status', ['pending_approval', 'approved', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    for (const r of (data ?? []) as Array<{ id: string; kind: string; reason: string | null; status: string; created_at: string; decided_at: string | null }>) {
      items.push({
        type: 'visit', id: r.id,
        primary: r.kind, secondary: r.reason ?? '',
        status: mapStatus(r.status, 'pending_approval'),
        requestedAt: r.created_at, decidedAt: r.decided_at, canReject: true,
      });
    }
  }

  if (caps.customer_transfer) {
    const { data } = await supabase
      .from('erp_customer_transfers')
      .select('id, reason, status, created_at, decided_at, customer:erp_customers(name, name_ar)')
      .in('status', ['pending', 'applied', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    for (const r of (data ?? []) as unknown as Array<{ id: string; reason: string | null; status: string; created_at: string; decided_at: string | null; customer: { name: string; name_ar: string | null } | null }>) {
      items.push({
        type: 'customer_transfer', id: r.id,
        primary: r.customer?.name_ar || r.customer?.name || '—',
        secondary: r.reason ?? '',
        status: mapStatus(r.status, 'pending'),
        requestedAt: r.created_at, decidedAt: r.decided_at, canReject: false,
      });
    }
  }

  if (caps.van_transfer) {
    const { data } = await supabase
      .from('erp_van_transfers')
      .select('id, transfer_number, reason, total_value, status, created_at, decided_at')
      .in('status', ['pending', 'approved', 'rejected', 'completed'])
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    for (const r of (data ?? []) as Array<{ id: string; transfer_number: string | null; reason: string | null; total_value: number | null; status: string; created_at: string; decided_at: string | null }>) {
      items.push({
        type: 'van_transfer', id: r.id,
        primary: r.transfer_number || '—',
        secondary: r.reason ?? String(r.total_value ?? ''),
        status: mapStatus(r.status, 'pending'),
        requestedAt: r.created_at, decidedAt: r.decided_at, canReject: true,
      });
    }
  }

  if (caps.trade_spend) {
    const { data } = await supabase
      .from('erp_trade_promotions')
      .select('id, name, method, status, created_at')
      .in('status', ['draft', 'pending', 'approved', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    for (const r of (data ?? []) as Array<{ id: string; name: string; method: string | null; status: string; created_at: string }>) {
      items.push({
        type: 'trade_spend', id: r.id,
        primary: r.name, secondary: r.method ?? '',
        status: r.status === 'approved' ? 'approved' : r.status === 'cancelled' ? 'rejected' : 'pending',
        requestedAt: r.created_at, decidedAt: null, canReject: true,
      });
    }
  }

  items.sort((a, b) => (b.requestedAt ?? '').localeCompare(a.requestedAt ?? ''));

  return (
    <div className="space-y-4">
      {/* When the unified inbox is on, engine tasks live HERE, so the separate
          Workflow/Center tabs are redundant and hidden. */}
      <ApprovalsTabs showWorkflow={!UNIFIED_INBOX() && canSeeWorkflowInbox(ctx)} />
      <ApprovalQueue items={items} caps={caps} />
    </div>
  );
}
