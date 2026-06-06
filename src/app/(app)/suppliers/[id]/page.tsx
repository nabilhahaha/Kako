import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { StatementTable, type StatementEntry } from '@/components/statement-table';
import { PAYMENT_METHOD_LABELS } from '@/lib/erp/constants';
import { formatCurrency } from '@/lib/utils';
import type { PaymentMethod, PurchaseOrder, Supplier, SupplierPayment } from '@/lib/erp/types';
import { BackLink } from '@/components/shared/back-link';
import { buttonVariants } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { SupplierOpeningBalance, type SupplierOpeningRow } from './opening-balance';

export default async function SupplierStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const { t, locale } = await getT();

  const supabase = await createClient();
  const { data: supplier } = await supabase
    .from('erp_suppliers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!supplier) notFound();
  const s = supplier as Supplier;

  const [{ data: pos }, { data: payments }] = await Promise.all([
    supabase
      .from('erp_purchase_orders')
      .select('id, po_number, net_amount, status, updated_at')
      .eq('supplier_id', id)
      .eq('status', 'received'),
    supabase
      .from('erp_supplier_payments')
      .select('id, amount, payment_method, payment_date, reference_number')
      .eq('supplier_id', id),
  ]);

  const poList = (pos as Pick<PurchaseOrder, 'id' | 'po_number' | 'net_amount' | 'status' | 'updated_at'>[]) ?? [];
  const payList = (payments as Pick<SupplierPayment, 'id' | 'amount' | 'payment_method' | 'payment_date' | 'reference_number'>[]) ?? [];

  // Additive enrichment: opening balances + purchase returns + FIFO aging.
  const { data: openingRows } = await supabase
    .from('erp_supplier_opening_balances')
    .select('id, balance_type, amount, as_of_date, note, status')
    .eq('supplier_id', id)
    .order('as_of_date');
  const openings = (openingRows as SupplierOpeningRow[]) ?? [];
  const activeOpenings = openings.filter((o) => o.status === 'active');

  const { data: prRows } = await supabase
    .from('erp_purchase_returns')
    .select('id, return_number, total_amount, created_at, status')
    .eq('supplier_id', id)
    .neq('status', 'draft')
    .neq('status', 'cancelled');
  const purchaseReturns = (prRows as { id: string; return_number: string; total_amount: number; created_at: string }[]) ?? [];

  const entries: StatementEntry[] = [
    ...activeOpenings.map((o) => ({
      date: o.as_of_date,
      ref: '—',
      description: t('ops.stmtOpening'),
      // credit (we owed) raises payable → debit column; debit (advance) → credit column
      debit: o.balance_type === 'credit' ? Number(o.amount) : 0,
      credit: o.balance_type === 'debit' ? Number(o.amount) : 0,
    })),
    ...poList.map((p) => ({
      date: p.updated_at,
      ref: p.po_number,
      description: t('suppliers.stmtDescReceipt'),
      debit: Number(p.net_amount),
      credit: 0,
    })),
    ...payList.map((p) => ({
      date: p.payment_date,
      ref: p.reference_number || '—',
      description: t('suppliers.stmtDescPayment', {
        method: PAYMENT_METHOD_LABELS[p.payment_method as PaymentMethod]?.[locale] ?? '',
      }),
      debit: 0,
      credit: Number(p.amount),
    })),
    ...purchaseReturns.map((r) => ({
      date: r.created_at,
      ref: r.return_number,
      description: t('ops.stmtPurchaseReturn'),
      debit: 0,
      credit: Number(r.total_amount),
    })),
  ];

  // FIFO aging of the outstanding payable: apply total credits (payments +
  // returns) to the oldest debits (opening-credit + received POs) first; bucket
  // whatever remains unpaid by the age of its document date.
  const debits = [
    ...activeOpenings.filter((o) => o.balance_type === 'credit').map((o) => ({ date: o.as_of_date, amount: Number(o.amount) })),
    ...poList.map((p) => ({ date: p.updated_at, amount: Number(p.net_amount) })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let credit = payList.reduce((s, p) => s + Number(p.amount), 0)
    + purchaseReturns.reduce((s, r) => s + Number(r.total_amount), 0)
    + activeOpenings.filter((o) => o.balance_type === 'debit').reduce((s, o) => s + Number(o.amount), 0);
  const now = Date.now();
  const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
  for (const d of debits) {
    const open = Math.max(d.amount - credit, 0);
    credit = Math.max(credit - d.amount, 0);
    if (open <= 0) continue;
    const days = Math.floor((now - new Date(d.date).getTime()) / 86400000);
    if (days <= 30) aging.d0_30 += open;
    else if (days <= 60) aging.d31_60 += open;
    else if (days <= 90) aging.d61_90 += open;
    else aging.d90 += open;
  }

  const supplierName = s.name_ar || s.name;
  const description = s.phone
    ? t('suppliers.stmtDescriptionWithPhone', { code: s.code, phone: s.phone })
    : t('suppliers.stmtDescription', { code: s.code });

  return (
    <div>
      <BackLink href="/suppliers" label={t('suppliers.stmtBackLink')} />
      <PageHeader
        title={t('suppliers.stmtTitle', { name: supplierName })}
        description={description}
        action={
          <Link href={`/print/supplier-statement/${id}`} target="_blank" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            <Printer className="h-4 w-4" /> {t('ops.stmtPrintPdf')}
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Summary label={t('suppliers.stmtSummaryBalance')} value={formatCurrency(s.balance)} tone={Number(s.balance) > 0 ? 'warn' : 'ok'} />
        <Summary label={t('suppliers.stmtSummaryReceiptCount')} value={String(poList.length)} />
        <Summary label={t('suppliers.stmtSummaryPaymentCount')} value={String(payList.length)} />
      </div>

      {/* Debt aging (FIFO) */}
      <div className="mb-4">
        <p className="mb-2 text-sm font-semibold">{t('ops.ageTitle')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Summary label={t('ops.age0_30')} value={formatCurrency(aging.d0_30)} />
          <Summary label={t('ops.age31_60')} value={formatCurrency(aging.d31_60)} />
          <Summary label={t('ops.age61_90')} value={formatCurrency(aging.d61_90)} />
          <Summary label={t('ops.age90')} value={formatCurrency(aging.d90)} tone={aging.d90 > 0 ? 'warn' : undefined} />
        </div>
      </div>

      {hasPermission(ctx, 'suppliers.manage') && (
        <div className="mb-4">
          <SupplierOpeningBalance supplierId={s.id} existing={openings} />
        </div>
      )}

      <StatementTable
        entries={entries}
        debitLabel={t('suppliers.stmtDebitLabel')}
        creditLabel={t('suppliers.stmtCreditLabel')}
        emptyText={t('suppliers.stmtEmpty')}
      />
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
