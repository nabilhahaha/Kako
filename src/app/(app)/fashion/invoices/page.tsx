import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { requireAnyPermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Pager } from '@/components/pager';
import { getT } from '@/lib/i18n/server';
import { FashionInvoicesList, type FashionInvoiceRow } from './invoices-list';

const PAGE_SIZE = 20;

/** Fashion invoice history — read-only. A clothing company only ever issues
 *  fashion sales, so this lists the company's erp_invoices (RLS-scoped) with
 *  reprint / save-as-PDF links and an optional per-customer filter. */
export default async function FashionInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string; customer?: string; from?: string; to?: string }>;
}) {
  await requireAnyPermission(['fashion.sell', 'fashion.reports']);
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? '').trim();
  const status = sp.status ?? 'all';
  const customer = (sp.customer ?? '').trim();
  const from = (sp.from ?? '').trim();
  const to = (sp.to ?? '').trim();
  const fromIdx = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  // Unified text search across invoice number, customer (name/phone) and product
  // (code/barcode/name): resolve a candidate invoice-id set, then filter by it.
  let qIds: string[] | null = null;
  if (q) {
    const safe = q.replace(/[(),]/g, ' ').trim();
    const like = `%${safe}%`;
    const ids = new Set<string>();
    const [byNum, custs, prods] = await Promise.all([
      supabase.from('erp_invoices').select('id').ilike('invoice_number', like).limit(500),
      supabase.from('erp_customers').select('id').or(`name.ilike.${like},name_ar.ilike.${like},phone.ilike.${like}`).limit(500),
      supabase.from('erp_products_catalog').select('id').or(`code.ilike.${like},barcode.ilike.${like},name.ilike.${like},name_ar.ilike.${like}`).limit(500),
    ]);
    (byNum.data as { id: string }[] | null)?.forEach((r) => ids.add(r.id));
    const custIds = (custs.data as { id: string }[] | null)?.map((r) => r.id) ?? [];
    const prodIds = (prods.data as { id: string }[] | null)?.map((r) => r.id) ?? [];
    const [byCust, byLine] = await Promise.all([
      custIds.length ? supabase.from('erp_invoices').select('id').in('customer_id', custIds).limit(1000) : Promise.resolve({ data: [] as { id: string }[] }),
      prodIds.length ? supabase.from('erp_invoice_lines').select('invoice_id').in('product_id', prodIds).limit(2000) : Promise.resolve({ data: [] as { invoice_id: string }[] }),
    ]);
    (byCust.data as { id: string }[] | null)?.forEach((r) => ids.add(r.id));
    (byLine.data as { invoice_id: string }[] | null)?.forEach((r) => ids.add(r.invoice_id));
    // No match → force an empty result rather than returning everything.
    qIds = ids.size ? Array.from(ids) : ['00000000-0000-0000-0000-000000000000'];
  }

  let listQuery = supabase
    .from('erp_invoices')
    .select('id, invoice_number, status, total_amount, discount_amount, tax_amount, net_amount, paid_amount, created_at, customer_id, customer:erp_customers(name, name_ar, phone)', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (qIds) listQuery = listQuery.in('id', qIds);
  if (status !== 'all') listQuery = listQuery.eq('status', status);
  if (customer) listQuery = listQuery.eq('customer_id', customer);
  if (from) listQuery = listQuery.gte('created_at', from);
  if (to) listQuery = listQuery.lte('created_at', `${to}T23:59:59.999`);

  const { data: invoices, count } = await listQuery.range(fromIdx, fromIdx + PAGE_SIZE - 1);

  // When filtered to one customer, surface their name for the banner.
  let customerName: string | null = null;
  if (customer) {
    const first = (invoices as unknown as FashionInvoiceRow[] | null)?.[0]?.customer ?? null;
    customerName = first ? (locale === 'ar' ? first.name_ar || first.name : first.name) : null;
  }

  return (
    <div>
      <PageHeader title={t('fashion.invoices.title')} description={t('fashion.invoices.description')} />
      <FashionInvoicesList
        invoices={(invoices as unknown as FashionInvoiceRow[]) ?? []}
        q={q}
        status={status}
        customerId={customer || null}
        customerName={customerName}
        from={from}
        to={to}
      />
      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={count ?? 0}
        basePath="/fashion/invoices"
        query={{ q: q || undefined, status: status !== 'all' ? status : undefined, customer: customer || undefined, from: from || undefined, to: to || undefined }}
      />
    </div>
  );
}
