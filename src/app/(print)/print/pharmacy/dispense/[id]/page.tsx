import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { formatDate } from '@/lib/utils';

export default async function DispensePrint({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const supabase = await createClient();
  const { data: d } = await supabase
    .from('erp_pharmacy_dispenses')
    .select('patient_name, patient_phone, doctor_name, rx_number, is_controlled, invoice_no, notes, dispensed_at, items:erp_pharmacy_dispense_items(name, qty, batch_number, expiry_date)')
    .eq('id', id).maybeSingle();
  if (!d) notFound();
  const o = d as unknown as {
    patient_name: string | null; patient_phone: string | null; doctor_name: string | null; rx_number: string | null;
    is_controlled: boolean; invoice_no: string | null; notes: string | null; dispensed_at: string;
    items: { name: string; qty: number; batch_number: string | null; expiry_date: string | null }[] | null;
  };
  const items = o.items ?? [];
  const name = ctx.company?.name_ar || ctx.company?.name || 'الصيدلية';

  return (
    <div className="space-y-4 text-sm">
      <div className="mb-2 flex justify-end"><PrintButton label="طباعة سند الصرف" /></div>
      <div className="border-b pb-3 text-center">
        <h1 className="text-xl font-bold">{name}</h1>
        <p className="text-sm">سند صرف أدوية{o.is_controlled ? ' — صنف مخدر/مقيّد' : ''}</p>
        <p className="text-xs text-gray-600" dir="ltr">{formatDate(o.dispensed_at)}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div><span className="text-gray-500">المريض: </span><b>{o.patient_name || '—'}</b></div>
        <div className="text-left"><span className="text-gray-500">الطبيب: </span>{o.doctor_name || '—'}</div>
        {o.rx_number && <div><span className="text-gray-500">رقم الروشتة: </span><span dir="ltr">{o.rx_number}</span></div>}
        {o.invoice_no && <div className="text-left"><span className="text-gray-500">فاتورة: </span><span dir="ltr">{o.invoice_no}</span></div>}
        {o.patient_phone && <div><span className="text-gray-500">الهاتف: </span><span dir="ltr">{o.patient_phone}</span></div>}
      </div>

      <table className="w-full border-collapse">
        <thead><tr className="border-y bg-gray-100"><th className="p-2 text-right">الدواء</th><th className="p-2 text-center">الكمية</th><th className="p-2 text-right">الدفعة</th><th className="p-2 text-left">الصلاحية</th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b"><td className="p-2">{it.name}</td><td className="p-2 text-center tabular-nums">{it.qty}</td><td className="p-2" dir="ltr">{it.batch_number || '—'}</td><td className="p-2 text-left" dir="ltr">{it.expiry_date ? formatDate(it.expiry_date) : '—'}</td></tr>
          ))}
          {items.length === 0 && <tr><td colSpan={4} className="p-2 text-center text-gray-500">لا أصناف</td></tr>}
        </tbody>
      </table>

      {o.notes && <p className="text-xs text-gray-600">ملاحظات: {o.notes}</p>}
      <div className="grid grid-cols-2 gap-8 pt-8 text-center text-xs text-gray-600">
        <div>توقيع الصيدلي<br /><br />__________</div>
        <div>توقيع المستلم<br /><br />__________</div>
      </div>
    </div>
  );
}
