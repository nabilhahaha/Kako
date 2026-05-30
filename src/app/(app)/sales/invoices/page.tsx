import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Pager } from '@/components/pager';
import type { Branch, ErpCustomer, Invoice, ProductCatalog } from '@/lib/erp/types';
import { InvoicesManager } from './invoices-manager';
import { getT } from '@/lib/i18n/server';

export interface InvoiceRow extends Invoice {
  customer: { name: string; name_ar: string | null; phone: string | null } | null;
}

const PAGE_SIZE = 20;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? '').trim();
  const status = sp.status ?? 'all';
  const fromIdx = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let listQuery = supabase
    .from('erp_invoices')
    .select('*, customer:erp_customers(name, name_ar, phone)', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (q) listQuery = listQuery.ilike('invoice_number', `%${q}%`);
  if (status !== 'all') listQuery = listQuery.eq('status', status);

  const [{ data: invoices, count }, { data: customers }, { data: branches }, { data: products }] =
    await Promise.all([
      listQuery.range(fromIdx, fromIdx + PAGE_SIZE - 1),
      supabase.from('erp_customers').select('*').eq('is_active', true).order('name'),
      supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
      supabase.from('erp_products_catalog').select('*').eq('is_active', true).order('name'),
    ]);

  return (
    <div>
      <PageHeader title={t('sales.invoicesTitle')} description={t('sales.invoicesDescription')} />
      <InvoicesManager
        invoices={(invoices as InvoiceRow[]) ?? []}
        customers={(customers as ErpCustomer[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        products={(products as ProductCatalog[]) ?? []}
        q={q}
        status={status}
      />
      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={count ?? 0}
        basePath="/sales/invoices"
        query={{ q: q || undefined, status: status !== 'all' ? status : undefined }}
      />
    </div>
  );
}
