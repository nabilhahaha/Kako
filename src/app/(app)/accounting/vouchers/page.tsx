import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Pager } from '@/components/pager';
import type { Branch, ChartOfAccount, PaymentVoucher, ReceiptVoucher } from '@/lib/erp/types';
import { VouchersManager, type VoucherRow } from './vouchers-manager';

const PAGE_SIZE = 20;

export default async function VouchersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; kind?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const sp = await searchParams;
  const kind = sp.kind === 'receipt' ? 'receipt' : 'payment';
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? '').trim();
  const fromIdx = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  // Only the active kind is paginated/queried; the toggle switches via the URL.
  const table = kind === 'payment' ? 'erp_payment_vouchers' : 'erp_receipt_vouchers';
  const partyCol = kind === 'payment' ? 'payee' : 'payer';
  let listQuery = supabase
    .from(table)
    .select('*, account:erp_chart_of_accounts(code, name, name_ar)', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (q) listQuery = listQuery.or(`voucher_number.ilike.%${q}%,${partyCol}.ilike.%${q}%`);

  const [{ data: vouchers, count }, { data: accounts }, { data: branches }] =
    await Promise.all([
      listQuery.range(fromIdx, fromIdx + PAGE_SIZE - 1),
      supabase
        .from('erp_chart_of_accounts')
        .select('*')
        .eq('is_group', false)
        .eq('is_active', true)
        .order('code'),
      supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
    ]);

  const rawRows = (vouchers as unknown as Array<(PaymentVoucher | ReceiptVoucher) & { payee?: string; payer?: string; account: VoucherRow['account'] }>) ?? [];
  const rows: VoucherRow[] = rawRows.map((v) => ({
    id: v.id, voucher_number: v.voucher_number, voucher_date: v.voucher_date,
    party: kind === 'payment' ? (v.payee ?? '') : (v.payer ?? ''),
    amount: v.amount, status: v.status, account: v.account,
  }));

  return (
    <div>
      <PageHeader
        title="سندات الصرف والقبض"
        description="صرف المصروفات النثرية وقبض الإيرادات المتنوعة (مع ترحيل تلقائي للقيد)"
      />
      <VouchersManager
        kind={kind}
        rows={rows}
        q={q}
        accounts={(accounts as ChartOfAccount[]) ?? []}
        branches={(branches as Branch[]) ?? []}
      />
      <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/accounting/vouchers" query={{ q: q || undefined, kind }} />
    </div>
  );
}
