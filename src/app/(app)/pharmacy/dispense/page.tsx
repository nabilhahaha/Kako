import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { DispenseList, type DispenseRow } from './dispense-list';

export default async function DispenseRegisterPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="سجل صرف الأدوية" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">إدارة الصيدلية تتم من داخل حساب الصيدلية.</p></div>);
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_pharmacy_dispenses')
    .select('id, status, patient_name, doctor_name, rx_number, is_controlled, dispensed_at, items:erp_pharmacy_dispense_items(id)')
    .order('dispensed_at', { ascending: false })
    .limit(200);
  const rows: DispenseRow[] = ((data as unknown as Array<{ id: string; status: string; patient_name: string | null; doctor_name: string | null; rx_number: string | null; is_controlled: boolean; dispensed_at: string; items: { id: string }[] | null }>) ?? [])
    .map((d) => ({ id: d.id, status: d.status, patient_name: d.patient_name, doctor_name: d.doctor_name, rx_number: d.rx_number, is_controlled: d.is_controlled, dispensed_at: d.dispensed_at, item_count: (d.items ?? []).length }));

  return (
    <div>
      <PageHeader title="سجل صرف الأدوية" description="دفتر صرف الروشتات والمخدرات — مع إرشاد الدفعة الأقرب انتهاءً (FEFO)." />
      <DispenseList rows={rows} />
    </div>
  );
}
