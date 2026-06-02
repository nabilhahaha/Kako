import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Pager } from '@/components/pager';
import type { Branch, Supplier } from '@/lib/erp/types';
import { parseListParams, applySearch } from '@/lib/erp/list-query';
import { SuppliersManager } from './suppliers-manager';
import { getT } from '@/lib/i18n/server';

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();
  const sp = await searchParams;
  const { page, q, pageSize, from, to } = parseListParams(sp);

  const supabase = await createClient();
  let listQuery = supabase.from('erp_suppliers').select('*', { count: 'exact' }).order('code');
  listQuery = applySearch(listQuery, q, ['code', 'name', 'name_ar', 'phone']);
  const [{ data: suppliers, count }, { data: branches }] = await Promise.all([
    listQuery.range(from, to),
    supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
  ]);

  return (
    <div>
      <PageHeader
        title={t('suppliers.pageTitle')}
        description={t('suppliers.pageDescription')}
      />
      <SuppliersManager
        suppliers={(suppliers as Supplier[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        q={q}
      />
      <Pager page={page} pageSize={pageSize} total={count ?? 0} basePath="/suppliers" query={{ q: q || undefined }} />
    </div>
  );
}
