// Built-in alert sources. Importing this module registers them via
// registerAlertSource. Each source reads tenant data (scoped by company_id) and
// yields the candidates whose condition currently fires; the engine dedupes,
// raises/auto-resolves, and dispatches. Modules/packs register their own sources
// the same way — no engine change.
//
// Phase A3 ships three cleanly-verifiable sources. Further ready sources (low
// stock, failed integrations, high discount variance) and schema-dependent ones
// (near-expiry stock, route/GPS — pending column additions) register here later.

import { registerAlertSource } from './registry';
import type { AlertCandidate, AlertDeps, AlertRule } from './types';

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ── Pending approvals: workflow tasks awaiting a decision past a grace window ──
registerAlertSource({
  key: 'pending_approvals',
  async evaluate(deps: AlertDeps, rule: AlertRule): Promise<AlertCandidate[]> {
    const olderHours = num(rule.threshold.olderThanHours, 24);
    const cutoff = new Date(deps.now() - olderHours * 3_600_000).toISOString();
    const { data } = await deps.db
      .from('erp_workflow_tasks')
      .select('id, instance_id, created_at')
      .eq('company_id', deps.companyId).eq('status', 'pending')
      .lt('created_at', cutoff);
    return ((data ?? []) as { id: string; instance_id: string }[]).map((t) => ({
      dedupeKey: `pending_approval:${t.id}`,
      entity: 'workflow_task', recordId: t.id,
      title: 'Approval pending', body: `A workflow approval has been pending longer than ${olderHours}h.`,
      payload: { task_id: t.id, instance_id: t.instance_id },
    }));
  },
});

// ── Overdue requests: pending workflow tasks past their SLA due date ─────────
registerAlertSource({
  key: 'overdue_requests',
  async evaluate(deps: AlertDeps): Promise<AlertCandidate[]> {
    const nowIso = new Date(deps.now()).toISOString();
    const { data } = await deps.db
      .from('erp_workflow_tasks')
      .select('id, instance_id, due_at')
      .eq('company_id', deps.companyId).eq('status', 'pending')
      .not('due_at', 'is', null).lt('due_at', nowIso);
    return ((data ?? []) as { id: string; instance_id: string; due_at: string }[]).map((t) => ({
      dedupeKey: `overdue_request:${t.id}`,
      severity: 'high',
      entity: 'workflow_task', recordId: t.id,
      title: 'Request overdue', body: 'A workflow approval is past its due date.',
      payload: { task_id: t.id, instance_id: t.instance_id, due_at: t.due_at },
    }));
  },
});

// ── Credit limit: customers whose balance exceeds their credit limit ─────────
registerAlertSource({
  key: 'credit_limit',
  async evaluate(deps: AlertDeps, rule: AlertRule): Promise<AlertCandidate[]> {
    const criticalPct = num(rule.threshold.criticalOverPct, 25);   // ≥ limit×(1+pct) → critical
    const { data } = await deps.db
      .from('erp_customers')
      .select('id, code, name, credit_limit, balance')
      .eq('company_id', deps.companyId).gt('credit_limit', 0);
    const rows = (data ?? []) as { id: string; code: string | null; name: string | null; credit_limit: number; balance: number | null }[];
    const out: AlertCandidate[] = [];
    for (const c of rows) {
      const limit = Number(c.credit_limit);
      const bal = Number(c.balance ?? 0);
      if (bal <= limit) continue;
      const critical = bal >= limit * (1 + criticalPct / 100);
      out.push({
        dedupeKey: `credit_limit:${c.id}`,
        severity: critical ? 'critical' : 'high',
        entity: 'customer', recordId: c.id,
        title: `Credit limit exceeded — ${c.name ?? c.code ?? c.id}`,
        body: `Balance ${bal} exceeds the credit limit ${limit}.`,
        payload: { customer_id: c.id, credit_limit: limit, balance: bal },
      });
    }
    return out;
  },
});

// ── Low stock: products whose total on-hand is below their min_stock ─────────
// Scoped by the product's own company (products_catalog.company_id); on-hand is
// summed across the product's inventory rows. Verifiable on existing columns.
registerAlertSource({
  key: 'low_stock',
  async evaluate(deps: AlertDeps): Promise<AlertCandidate[]> {
    const { data: products } = await deps.db
      .from('erp_products_catalog')
      .select('id, code, name, min_stock')
      .eq('company_id', deps.companyId).gt('min_stock', 0);
    const list = (products ?? []) as { id: string; code: string | null; name: string | null; min_stock: number }[];
    if (list.length === 0) return [];

    const ids = list.map((p) => p.id);
    const { data: stock } = await deps.db
      .from('erp_inventory_stock')
      .select('product_id, quantity')
      .in('product_id', ids);
    const onHand = new Map<string, number>();
    for (const s of (stock ?? []) as { product_id: string; quantity: number | null }[]) {
      onHand.set(s.product_id, (onHand.get(s.product_id) ?? 0) + Number(s.quantity ?? 0));
    }

    const out: AlertCandidate[] = [];
    for (const p of list) {
      const have = onHand.get(p.id) ?? 0;
      const min = Number(p.min_stock);
      if (have >= min) continue;
      out.push({
        dedupeKey: `low_stock:${p.id}`,
        severity: have <= 0 ? 'high' : 'warning',
        entity: 'product', recordId: p.id,
        title: `Low stock — ${p.name ?? p.code ?? p.id}`,
        body: `On-hand ${have} is below the minimum ${min}.`,
        payload: { product_id: p.id, on_hand: have, min_stock: min },
      });
    }
    return out;
  },
});

export {};
