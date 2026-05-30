import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { StatementTable, type StatementEntry } from '@/components/statement-table';
import { EntityNotes } from '@/components/entity/entity-notes';
import { PAYMENT_METHOD_LABELS } from '@/lib/erp/constants';
import { formatCurrency } from '@/lib/utils';
import type { ErpCustomer, Invoice, Payment, PaymentMethod } from '@/lib/erp/types';
import { ArrowRight, Printer } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { WhatsAppButton } from '@/components/whatsapp-button';
import { getT } from '@/lib/i18n/server';

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

  const entries: StatementEntry[] = [
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
  ];

  const customerName = c.name_ar || c.name;
  const description = c.phone
    ? t('customers.stmtDescriptionWithPhone', { code: c.code, phone: c.phone })
    : t('customers.stmtDescription', { code: c.code });

  return (
    <div>
      <Link href="/customers" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-4 w-4" /> {t('customers.stmtBackLink')}
      </Link>
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

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Summary label={t('customers.stmtSummaryBalance')} value={formatCurrency(c.balance)} tone={Number(c.balance) > 0 ? 'warn' : 'ok'} />
        <Summary label={t('customers.stmtSummaryCreditLimit')} value={formatCurrency(c.credit_limit)} />
        <Summary label={t('customers.stmtSummaryInvoiceCount')} value={String(invList.length)} />
      </div>

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
