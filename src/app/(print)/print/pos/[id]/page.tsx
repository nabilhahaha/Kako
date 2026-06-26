import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { getUserContext } from '@/lib/erp/auth-context';
import { PrintButton } from '@/components/print-button';
import { AutoPrint } from '@/components/print/auto-print';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getPosInvoice } from '@/app/(app)/pos/pos-actions';

const TYPE: Record<string, string> = { dine_in: 'صالة', takeaway: 'تيك أواي', delivery: 'دليفري' };
const METHOD: Record<string, string> = { cash: 'كاش', card: 'فيزا', mixed: 'مختلط' };

/**
 * Fast Food POS — ZATCA-READY simplified tax invoice receipt. Renders the seller legal name +
 * VAT, sequential invoice number, date/time, cashier, items, tax breakdown, total, payment
 * method and the Phase-1 ZATCA QR (TLV/Base64 stored at issue). Data comes from the immutable
 * erp_pos_invoices ledger (RLS company-scoped). This is a ZATCA-ready FOUNDATION — not an
 * officially compliant Phase-2 e-invoice until cryptographic signing + ZATCA reporting are
 * integrated and tested.
 */
export default async function PosReceiptPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const sp = await searchParams;

  const res = await getPosInvoice(id);
  if (!res.ok) notFound();
  const inv = res.data;
  const isCredit = inv.docType === 'credit_note';
  const qrDataUrl = inv.zatcaQr ? await QRCode.toDataURL(inv.zatcaQr, { margin: 1, width: 160 }) : null;
  const name = ctx.company?.name_ar || ctx.company?.name || inv.sellerName || 'المطعم';

  return (
    <div className="mx-auto max-w-xs space-y-3 text-sm">
      {sp.autoprint === '1' && <AutoPrint />}
      <div className="mb-1 flex justify-end print:hidden"><PrintButton label="طباعة الفاتورة" /></div>

      <div className="border-b pb-2 text-center">
        <h1 className="text-lg font-bold">{name}</h1>
        <p className="text-[11px] font-medium">{isCredit ? 'إشعار دائن' : 'فاتورة ضريبية مبسطة'} · Simplified Tax Invoice</p>
        {inv.sellerVat && <p className="text-xs text-gray-600" dir="ltr">VAT: {inv.sellerVat}</p>}
        {ctx.company?.phone && <p className="text-xs text-gray-600" dir="ltr">{ctx.company.phone}</p>}
      </div>

      <div className="flex flex-wrap justify-between gap-x-2 text-[11px] text-gray-700">
        <span dir="ltr">#{inv.invoiceNumber}</span>
        <span dir="ltr">{formatDate(inv.issueAt)}</span>
        <span>{TYPE[inv.orderType ?? ''] ?? inv.orderType}</span>
        {inv.cashierName && <span>الكاشير: {inv.cashierName}</span>}
        {inv.customerName && <span>العميل: {inv.customerName}</span>}
      </div>

      <table className="w-full border-collapse">
        <thead><tr className="border-y bg-gray-100 text-[11px]"><th className="p-1 text-right">الصنف</th><th className="p-1 text-center">كمية</th><th className="p-1 text-left">سعر</th><th className="p-1 text-left">إجمالي</th></tr></thead>
        <tbody>
          {inv.lines.map((it, i) => (
            <tr key={i} className="border-b text-[12px]">
              <td className="p-1">{it.name}{it.note ? <span className="block text-[10px] text-gray-500">{it.note}</span> : null}</td>
              <td className="p-1 text-center tabular-nums">{it.qty}</td>
              <td className="p-1 text-left tabular-nums" dir="ltr">{formatCurrency(it.unitPrice)}</td>
              <td className="p-1 text-left tabular-nums" dir="ltr">{formatCurrency(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ms-auto w-48 space-y-0.5 text-[12px]">
        <Line label="الإجمالي الفرعي" val={inv.subtotal} />
        {inv.discountTotal !== 0 && <Line label="الخصم" val={-Math.abs(inv.discountTotal)} />}
        {inv.serviceTotal !== 0 && <Line label="الخدمة" val={inv.serviceTotal} />}
        {inv.taxTotal !== 0 && <Line label="ضريبة القيمة المضافة (VAT)" val={inv.taxTotal} />}
        <div className="flex justify-between border-t pt-1 text-base font-bold"><span>الإجمالي</span><span className="tabular-nums" dir="ltr">{formatCurrency(inv.grandTotal)}</span></div>
        {inv.paymentMethod && <div className="flex justify-between text-[11px] text-gray-500"><span>طريقة الدفع</span><span>{METHOD[inv.paymentMethod] ?? inv.paymentMethod}</span></div>}
      </div>

      {qrDataUrl && (
        <div className="flex flex-col items-center gap-1 pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="ZATCA QR" width={140} height={140} />
          <span className="text-[9px] text-gray-400">ZATCA QR</span>
        </div>
      )}

      <p className="pt-2 text-center text-xs text-gray-500">شكراً لزيارتكم 🙏</p>
    </div>
  );
}

function Line({ label, val }: { label: string; val: number }) {
  return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="tabular-nums" dir="ltr">{formatCurrency(val)}</span></div>;
}
