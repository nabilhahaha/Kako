import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { DispenseEditor, type DispenseHeader, type DispenseItem, type ProductOption } from './dispense-editor';

export default async function DispenseEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const supabase = await createClient();
  const { data: d } = await supabase
    .from('erp_pharmacy_dispenses')
    .select('id, status, patient_name, patient_phone, doctor_name, rx_number, is_controlled, invoice_no, notes')
    .eq('id', id).maybeSingle();
  if (!d) notFound();

  const [{ data: items }, { data: products }] = await Promise.all([
    supabase.from('erp_pharmacy_dispense_items').select('id, name, qty, price, batch_number, expiry_date').eq('dispense_id', id).order('created_at'),
    supabase.from('erp_products_catalog').select('id, name, name_ar, sell_price').eq('is_active', true).order('name').limit(500),
  ]);

  const prods: ProductOption[] = ((products as { id: string; name: string; name_ar: string | null; sell_price: number }[]) ?? [])
    .map((p) => ({ id: p.id, name: p.name_ar || p.name, price: Number(p.sell_price || 0) }));

  return (
    <DispenseEditor
      dispense={d as DispenseHeader}
      items={(items as DispenseItem[]) ?? []}
      products={prods}
    />
  );
}
