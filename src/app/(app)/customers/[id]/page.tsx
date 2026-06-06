import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { StatementTable, type StatementEntry } from '@/components/statement-table';
import { EntityNotes } from '@/components/entity/entity-notes';
import { Badge } from '@/components/ui/badge';
import { PAYMENT_METHOD_LABELS, CUSTOMER_STATUSES } from '@/lib/erp/constants';
import { formatCurrency } from '@/lib/utils';
import type { ErpCustomer, Invoice, Payment, PaymentMethod } from '@/lib/erp/types';
import { Printer } from 'lucide-react';
import { BackLink } from '@/components/shared/back-link';
import { buttonVariants } from '@/components/ui/button';
import { WhatsAppButton } from '@/components/whatsapp-button';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { CreditRequestButton } from './credit-request-button';
import { CustomerOpeningBalance, type OpeningBalanceRow } from './opening-balance';

export default async function CustomerStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const { t, locale } = await getT();

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from('erp_customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!customer) notFound();
  const c = customer as ErpCustomer;

  // FP-CS: resolve the status reason label + who last changed it for the 360 view.
  let statusReasonName = '';
  if (c.status_reason_id) {
    const { data: rl } = await supabase.from('erp_customer_lookups').select('name, name_ar').eq('id', c.status_reason_id).maybeSingle();
    const r = rl as { name: string; name_ar: string | null } | null;
    if (r) statusReasonName = locale === 'ar' ? r.name_ar || r.name : r.name;
  }
  let statusChangedByName = '';
  if (c.status_changed_by) {
    const { data: pf } = await supabase.from('erp_profiles').select('full_name, email').eq('id', c.status_changed_by).maybeSingle();
    const p = pf as { full_name: string | null; email: string | null } | null;
    if (p) statusChangedByName = p.full_name || p.email || '';
  }
  const statusLabel = CUSTOMER_STATUSES.find((s) => s.value === c.customer_status)?.[locale] ?? c.customer_status;
  const statusTone = c.customer_status === 'active' ? 'success' : c.customer_status === 'blocked' ? 'destructive' : 'warning';

  const { data: invoices } = await supabase
    .from('erp_invoices')
    .select('id, invoice_number, net_amount, status, created_at')
    .eq('customer_id', id)
    .neq('status', 'draft')
    .neq('status', 'cancelled');

  const invList = (invoices as Pick<Invoice, 'id' | 'invoice_number' | 'net_amount' | 'status' | 'created_at'>[]) ?? [];
  const invoiceIds = invList.map((i) => i.id);

  let payments: Array<Pick<Payment, 'id' | 'amount' | 'payment_method' | 'payment_date' | 'invoice_id'>> = [];
  if (invoiceIds.length > 0) {
    const { data } = await supabase
      .from('erp_payments')
      .select('id, amount, payment_method, payment_date, invoice_id')
      .in('invoice_id', invoiceIds);
    payments = data ?? [];
  }
  const invNumberById = new Map(invList.map((i) => [i.id, i.invoice_number]));

  // Opening balances, sales returns, and installment collections — additive
  // statement enrichment (opening · sales · collections · installments · returns).
  const { data: openingRows } = await supabase
    .from('erp_customer_opening_balances')
    .select('id, balance_type, amount, as_of_date, note, status, applied_to_balance')
    .eq('customer_id', id)
    .order('as_of_date');
  const openings = (openingRows as (OpeningBalanceRow & { applied_to_balance: boolean })[]) ?? [];
  const activeOpenings = openings.filter((o) => o.status === 'active');

  const { data: returnRows } = await supabase
    .from('erp_sales_returns')
    .select('id, return_number, total_amount, created_at, status')
    .eq('customer_id', id)
    .neq('status', 'draft')
    .neq('status', 'cancelled');
  const returns = (returnRows as { id: string; return_number: string; total_amount: number; created_at: string }[]) ?? [];

  const { data: planRows } = await supabase
    .from('erp_installment_plans')
    .select('id')
    .eq('customer_id', id);
  const planIds = (planRows as { id: string }[] | null)?.map((p) => p.id) ?? [];
  let instPayments: { amount: number; paid_at: string }[] = [];
  if (planIds.length > 0) {
    const { data } = await supabase
      .from('erp_installment_payments')
      .select('amount, paid_at')
      .in('plan_id', planIds);
    instPayments = (data as { amount: number; paid_at: string }[]) ?? [];
  }

  const entries: StatementEntry[] = [
    ...activeOpenings
      .filter((o) => o.applied_to_balance && (o.balance_type === 'debit' || o.balance_type === 'credit'))
      .map((o) => ({
        date: o.as_of_date,
        ref: '—',
        description: t('ops.stmtOpening'),
        debit: o.balance_type === 'debit' ? Number(o.amount) : 0,
        credit: o.balance_type === 'credit' ? Number(o.amount) : 0,
      })),
    ...invList.map((i) => ({
      date: i.created_at,
      ref: i.invoice_number,
      description: t('customers.stmtDescInvoice'),
      debit: Number(i.net_amount),
      credit: 0,
    })),
    ...payments.map((p) => ({
      date: p.payment_date,
      ref: invNumberById.get(p.invoice_id) ?? '—',
      description: t('customers.stmtDescCollection', {
        method: PAYMENT_METHOD_LABELS[p.payment_method as PaymentMethod]?.[locale] ?? '',
      }),
      debit: 0,
      credit: Number(p.amount),
    })),
    ...instPayments.map((p) => ({
      date: p.paid_at,
      ref: '—',
      description: t('ops.stmtInstallment'),
      debit: 0,
      credit: Number(p.amount),
    })),
    ...returns.map((r) => ({
      date: r.created_at,
      ref: r.return_number,
      description: t('ops.stmtSalesReturn'),
      debit: 0,
      credit: Number(r.total_amount),
    })),
  ];

  const customerName = c.name_ar || c.name;
  const description = c.phone
    ? t('customers.stmtDescriptionWithPhone', { code: c.code, phone: c.phone })
    : t('customers.stmtDescription', { code: c.code });

  return (
    <div>
      <BackLink href="/customers" label={t('customers.stmtBackLink')} />
      <PageHeader
        title={t('customers.stmtTitle', { name: customerName })}
        description={description}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {Number(c.balance) > 0 && (
              <WhatsAppButton
                phone={c.phone}
                label={t('customers.stmtWhatsAppLabel')}
                message={t('customers.stmtWhatsAppMsg', {
                  name: customerName,
                  amount: formatCurrency(c.balance),
                })}
                className="h-9 border px-3"
              />
            )}
            <Link href={`/print/statement/${id}`} target="_blank" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              <Printer className="h-4 w-4" /> {t('customers.stmtBtnPrint')}
            </Link>
          </div>
        }
      />

      {/* FP-CS: status + reason + last-change context — Sales/Finance/Collections. */}
      <div className={`mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3 text-sm ${c.customer_status !== 'active' ? 'border-warning/40 bg-warning/5' : ''}`}>
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('customers.statusLabel')}:</span>
          <Badge variant={statusTone}>{statusLabel}</Badge>
        </span>
        {statusReasonName && (
          <span><span className="text-muted-foreground">{t('customers.fieldStatusReason')}:</span> {statusReasonName}{c.status_reason_note ? ` — ${c.status_reason_note}` : ''}</span>
        )}
        {c.status_changed_at && (
          <span className="text-muted-foreground">
            {t('customers.statusSinceLabel')}: <span dir="ltr">{new Date(c.status_changed_at).toLocaleDateString()}</span>
            {statusChangedByName ? ` · ${statusChangedByName}` : ''}
          </span>
        )}
        {c.customer_status !== 'active' && (
          <span className="text-xs text-muted-foreground">{t('customers.statusCollectionsNote')}</span>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Summary label={t('customers.stmtSummaryBalance')} value={formatCurrency(c.balance)} tone={Number(c.balance) > 0 ? 'warn' : 'ok'} />
        <Summary label={t('customers.stmtSummaryCreditLimit')} value={formatCurrency(c.credit_limit)} />
        <Summary label={t('customers.stmtSummaryInvoiceCount')} value={String(invList.length)} />
      </div>

      {/* FMCG Wave 1 — credit-limit change request (credit.request.create). */}
      {hasPermission(ctx, 'credit.request.create') && (
        <div className="mb-4">
          <CreditRequestButton customerId={c.id} currentLimit={Number(c.credit_limit)} />
        </div>
      )}

      {hasPermission(ctx, 'customers.manage') && (
        <div className="mb-4">
          <CustomerOpeningBalance customerId={c.id} existing={openings as OpeningBalanceRow[]} />
        </div>
      )}

      <StatementTable
        entries={entries}
        debitLabel={t('customers.stmtDebitLabel')}
        creditLabel={t('customers.stmtCreditLabel')}
        emptyText={t('customers.stmtEmpty')}
      />

      {/* Entity Framework — inherited Notes capability (build once, reuse everywhere) */}
      <div className="mt-6">
        <EntityNotes entity="customer" recordId={c.id} />
      </div>
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'ok' }) {
  const cls = tone === 'warn' ? 'text-warning' : tone === 'ok' ? 'text-success' : '';
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold tabular-nums ${cls}`} dir="ltr">{value}</p>
      </CardContent>
    </Card>
  );
}
