import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { requirePermission } from '@/lib/erp/guards';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { cashboxSummary, type CashMovement } from '@/lib/fashion/cashbox';
import { CashboxManager, type ShiftHistoryRow } from './cashbox-manager';

export const dynamic = 'force-dynamic';

export default async function CashboxPage() {
  const { t, locale } = await getT();
  await requirePermission('treasury.manage');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title={t('cashbox.title')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('cashbox.noCompany')}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // ── Active (open) shift + its movement summary ──
  const { data: sess } = await supabase
    .from('erp_cash_sessions')
    .select('id, opening_float, opened_at, opened_by')
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const session = sess as
    | { id: string; opening_float: number; opened_at: string; opened_by: string | null }
    | null;

  let summary = null as ReturnType<typeof cashboxSummary> | null;
  if (session) {
    const { data: moves } = await supabase
      .from('erp_cash_movements').select('kind, amount').eq('session_id', session.id);
    summary = cashboxSummary(Number(session.opening_float || 0), (moves as CashMovement[]) ?? []);
  }

  // ── Closed-shift history (owner reporting: variance, opening/closing, handover
  //    chain, cashier performance). RLS scopes rows to the caller's tenant. ──
  const { data: closedRaw } = await supabase
    .from('erp_cash_sessions')
    .select('id, opening_float, expected_amount, closing_counted, variance, closed_at, closed_by, opened_at')
    .eq('status', 'closed')
    .order('closed_at', { ascending: false })
    .limit(12);
  const closed = (closedRaw ?? []) as Array<{
    id: string; opening_float: number; expected_amount: number | null;
    closing_counted: number | null; variance: number | null;
    closed_at: string | null; closed_by: string | null; opened_at: string;
  }>;

  // Resolve cashier display names for the involved users (tenant-visible only).
  const userIds = [
    ...new Set([
      ...(session?.opened_by ? [session.opened_by] : []),
      ...closed.map((r) => r.closed_by).filter((x): x is string => !!x),
    ]),
  ];
  const nameById = new Map<string, string>();
  if (userIds.length) {
    const { data: profs } = await supabase
      .from('erp_profiles').select('id, full_name, email').in('id', userIds);
    for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      nameById.set(p.id, p.full_name?.trim() || p.email || p.id);
    }
  }

  const history: ShiftHistoryRow[] = closed.map((r) => ({
    id: r.id,
    opening: Number(r.opening_float || 0),
    expected: r.expected_amount == null ? null : Number(r.expected_amount),
    counted: r.closing_counted == null ? null : Number(r.closing_counted),
    variance: r.variance == null ? null : Number(r.variance),
    closedAt: r.closed_at,
    cashier: (r.closed_by && nameById.get(r.closed_by)) || '—',
  }));

  // Handover: the last closed shift's counted cash seeds the next opening float.
  const lastCounted = closed.length && closed[0].closing_counted != null
    ? Number(closed[0].closing_counted) : 0;

  return (
    <div>
      <PageHeader title={t('cashbox.title')} description={t('cashbox.description')} />
      <CashboxManager
        session={
          session
            ? { id: session.id, openingFloat: Number(session.opening_float || 0), openedAt: session.opened_at,
                openedBy: (session.opened_by && nameById.get(session.opened_by)) || '—' }
            : null
        }
        summary={summary}
        lastCounted={lastCounted}
        history={history}
        intlLocale={INTL_LOCALE[locale]}
      />
    </div>
  );
}
