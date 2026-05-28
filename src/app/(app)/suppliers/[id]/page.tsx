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

export default async function SupplierStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;

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
      description: 'استلام بضاعة (مشتريات)',
      debit: Number(p.net_amount),
      credit: 0,
    })),
    ...payList.map((p) => ({
      date: p.payment_date,
      ref: p.reference_number || '—',
      description: `سداد (${PAYMENT_METHOD_LABELS[p.payment_method as PaymentMethod]?.ar ?? ''})`,
      debit: 0,
      credit: Number(p.amount),
    })),
  ];

  return (
    <div>
      <Link href="/suppliers" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-4 w-4" /> الموردين
      </Link>
      <PageHeader
        title={`كشف حساب: ${s.name_ar || s.name}`}
        description={`الكود ${s.code}${s.phone ? ' · ' + s.phone : ''}`}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Summary label="الرصيد المستحق" value={formatCurrency(s.balance)} tone={Number(s.balance) > 0 ? 'warn' : 'ok'} />
        <Summary label="مرات الاستلام" value={String(poList.length)} />
        <Summary label="مرات السداد" value={String(payList.length)} />
      </div>

      <StatementTable
        entries={entries}
        debitLabel="مستحق (بضاعة)"
        creditLabel="سداد"
        emptyText="لا توجد حركات على هذا المورد بعد."
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
