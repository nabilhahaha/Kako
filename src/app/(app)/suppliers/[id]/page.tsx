import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { StatementTable, type StatementEntry } from '@/components/statement-table';
import { PAYMENT_METHOD_LABELS } from '@/lib/erp/constants';
import { formatCurrency } from '@/lib/utils';
import type { PaymentMethod, PurchaseOrder, Supplier, SupplierPayment } from '@/lib/erp/types';
import { ArrowRight } from 'lucide-react';
import { getT } from '@/lib/i18n/server';

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

  const entries: StatementEntry[] = [
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
  ];

  const supplierName = s.name_ar || s.name;
  const description = s.phone
    ? t('suppliers.stmtDescriptionWithPhone', { code: s.code, phone: s.phone })
    : t('suppliers.stmtDescription', { code: s.code });

  return (
    <div>
      <Link href="/suppliers" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-4 w-4" /> {t('suppliers.stmtBackLink')}
      </Link>
      <PageHeader
        title={t('suppliers.stmtTitle', { name: supplierName })}
        description={description}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Summary label={t('suppliers.stmtSummaryBalance')} value={formatCurrency(s.balance)} tone={Number(s.balance) > 0 ? 'warn' : 'ok'} />
        <Summary label={t('suppliers.stmtSummaryReceiptCount')} value={String(poList.length)} />
        <Summary label={t('suppliers.stmtSummaryPaymentCount')} value={String(payList.length)} />
      </div>

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
