import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { CollectionsManager, type ARCustomer, type OpenInvoice, type RecentCollection } from './collections-manager';

/**
 * Collections workspace — a dedicated AR screen for the Collection Officer (and
 * any role with `sales.collect`). Lists customers with an outstanding balance,
 * their open invoices, and records collections via the erp_settle_collection RPC.
 * All reads are RLS-scoped (a rep sees only their own customers; managers more).
 */
export default async function CollectionsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  const supabase = await createClient();

  // Customers carrying AR (RLS-scoped to the viewer).
  const { data: customersRaw } = await supabase
    .from('erp_customers')
    .select('id, code, name, name_ar, balance, branch_id')
    .gt('balance', 0)
    .order('balance', { ascending: false });
  const customers = (customersRaw as ARCustomer[]) ?? [];

  // Open (unpaid / partially-paid) invoices for those customers.
  const custIds = customers.map((c) => c.id);
  const { data: invoicesRaw } = custIds.length
    ? await supabase
        .from('erp_invoices')
        .select('id, invoice_number, customer_id, branch_id, net_amount, paid_amount, due_date, created_at, status')
        .in('customer_id', custIds)
        .order('created_at', { ascending: true })
    : { data: [] as unknown[] };
  const openInvoices = ((invoicesRaw as OpenInvoice[]) ?? []).filter(
    (i) =>
      Number(i.net_amount) - Number(i.paid_amount ?? 0) > 0.01 &&
      !['void', 'cancelled', 'draft'].includes(String(i.status)),
  );

  // Recent collections (context).
  const { data: recentRaw } = await supabase
    .from('erp_collections')
    .select('id, collection_number, collection_date, amount, method, customer_id, status')
    .order('collection_date', { ascending: false })
    .limit(20);
  const recent = (recentRaw as RecentCollection[]) ?? [];

  // SoD: reversing a posted collection is a FINANCE/ADMIN correction, not a
  // selling right. Only `accounting.post` (Finance/Accountant; admins hold ALL)
  // may reverse — so the Reverse control is hidden for the Sales Rep. The server
  // action enforces the same check, so this is defence-in-depth, not the gate.
  const canReverse = hasPermission(ctx, 'accounting.post');

  return (
    <div>
      <PageHeader title={t('sales.collectionsTitle')} description={t('sales.collectionsDescription')} />
      <CollectionsManager customers={customers} openInvoices={openInvoices} recent={recent} canReverse={canReverse} />
    </div>
  );
}
