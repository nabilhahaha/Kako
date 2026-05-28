import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Branch, ChartOfAccount, PaymentVoucher, ReceiptVoucher } from '@/lib/erp/types';
import { VouchersManager, type VoucherRow } from './vouchers-manager';

export default async function VouchersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const [{ data: payments }, { data: receipts }, { data: accounts }, { data: branches }] =
    await Promise.all([
      supabase
        .from('erp_payment_vouchers')
        .select('*, account:erp_chart_of_accounts(code, name, name_ar)')
        .order('created_at', { ascending: false }),
      supabase
        .from('erp_receipt_vouchers')
        .select('*, account:erp_chart_of_accounts(code, name, name_ar)')
        .order('created_at', { ascending: false }),
      supabase
        .from('erp_chart_of_accounts')
        .select('*')
        .eq('is_group', false)
        .eq('is_active', true)
        .order('code'),
      supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
    ]);

  const paymentRows = (payments as unknown as Array<PaymentVoucher & { account: VoucherRow['account'] }>) ?? [];
  const receiptRows = (receipts as unknown as Array<ReceiptVoucher & { account: VoucherRow['account'] }>) ?? [];

  const payList: VoucherRow[] = paymentRows.map((v) => ({
    id: v.id, voucher_number: v.voucher_number, voucher_date: v.voucher_date,
    party: v.payee, amount: v.amount, status: v.status, account: v.account,
  }));
  const recList: VoucherRow[] = receiptRows.map((v) => ({
    id: v.id, voucher_number: v.voucher_number, voucher_date: v.voucher_date,
    party: v.payer, amount: v.amount, status: v.status, account: v.account,
  }));

  return (
    <div>
      <PageHeader
        title="سندات الصرف والقبض"
        description="صرف المصروفات النثرية وقبض الإيرادات المتنوعة (مع ترحيل تلقائي للقيد)"
      />
      <VouchersManager
        paymentVouchers={payList}
        receiptVouchers={recList}
        accounts={(accounts as ChartOfAccount[]) ?? []}
        branches={(branches as Branch[]) ?? []}
      />
    </div>
  );
}
