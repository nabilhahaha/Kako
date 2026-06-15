'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';
import { loadTodayJourney } from '@/app/(app)/field/actions';
import type { NextCandidate } from './next-customer';

// Assemble today's remaining-route candidates for the Smart Next Customer engine.
// Candidates ARE today's route stops (route protection), enriched with the flags
// the cards show (overdue / credit warning / active). The pure engine ranks them
// route-first on the client (which holds the live GPS).
export async function loadNextCandidates(): Promise<ActionResult<{ candidates: NextCandidate[]; date: string }>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!hasPermission(ctx, 'field.sales')) return { ok: false, error: 'unauthorized' };

  const jr = await loadTodayJourney();
  if (!jr.ok || !jr.data) return { ok: false, error: jr.error ?? 'no_journey' };
  const { stops, visited, date } = jr.data;
  const visitedSet = new Set(visited);
  const ids = stops.map((s) => s.customer_id);

  const supabase = await createClient();

  // Customer flags: balance / credit limit / terms / active.
  const cust = new Map<string, { balance: number; creditLimit: number; terms: number; active: boolean }>();
  if (ids.length) {
    const { data } = await supabase
      .from('erp_customers')
      .select('id, balance, credit_limit, payment_terms_days, is_active')
      .in('id', ids);
    for (const c of (data ?? []) as { id: string; balance: number | null; credit_limit: number | null; payment_terms_days: number | null; is_active: boolean | null }[]) {
      cust.set(c.id, {
        balance: Number(c.balance ?? 0),
        creditLimit: Number(c.credit_limit ?? 0),
        terms: Number(c.payment_terms_days ?? 0),
        active: c.is_active !== false,
      });
    }
  }

  // Overdue snapshot: any open invoice older than the customer's terms.
  const overdue = new Set<string>();
  if (ids.length) {
    const daysSince = (iso: string) =>
      Math.max(0, Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`)) / 86_400_000));
    const { data: inv } = await supabase
      .from('erp_invoices')
      .select('customer_id, created_at, net_amount, paid_amount, status')
      .in('customer_id', ids)
      .in('status', ['issued', 'partially_paid', 'overdue']);
    for (const r of (inv ?? []) as { customer_id: string; created_at: string; net_amount: number; paid_amount: number }[]) {
      const out = Number(r.net_amount ?? 0) - Number(r.paid_amount ?? 0);
      if (out <= 0) continue;
      const terms = cust.get(r.customer_id)?.terms ?? 0;
      if (terms > 0 && daysSince(r.created_at) > terms) overdue.add(r.customer_id);
    }
  }

  const candidates: NextCandidate[] = stops.map((s) => {
    const f = cust.get(s.customer_id);
    const creditWarning = !!f && f.creditLimit > 0 && f.balance >= f.creditLimit;
    return {
      customerId: s.customer_id,
      name: s.customer_name ?? s.customer_code ?? '—',
      nameAr: s.customer_name_ar,
      sequence: s.sequence,
      latitude: s.latitude,
      longitude: s.longitude,
      overdue: overdue.has(s.customer_id),
      creditWarning,
      visited: visitedSet.has(s.customer_id),
      active: f?.active !== false,
    };
  });

  return { ok: true, data: { candidates, date } };
}
