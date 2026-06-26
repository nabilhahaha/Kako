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
 * Fast Food POS — ZATCA-READY simplified tax invoice receipt, formatted for THERMAL paper
 * (80mm / 58mm via `?w=`). Renders the seller legal name + VAT, sequential invoice number,
 * date/time, cashier, items, tax breakdown, total, payment method (with cash received/change),
 * and the Phase-1 ZATCA QR. Presentation toggles (`logo`, `qr`, `cashier`) come from the
 * per-till print settings. Data is the immutable erp_pos_invoices ledger (RLS company-scoped).
 * This is a ZATCA-ready FOUNDATION — not an officially compliant Phase-2 e-invoice until
 * cryptographic signing + ZATCA reporting are integrated and tested.
 */
export default async function PosReceiptPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const sp = await searchParams;

  // Presentation from print settings (default ON; explicit '0' turns a section off).
  const widthMm = sp.w === '58' ? 58 : 80;
  const showLogo = sp.logo !== '0';
  const showQr = sp.qr !== '0';
  const showCashier = sp.cashier !== '0';
  const received = sp.recv != null && sp.recv !== '' ? Number(sp.recv) : null;
  const change = sp.chg != null && sp.chg !== '' ? Number(sp.chg) : null;

  const res = await getPosInvoice(id);
  if (!res.ok) notFound();
  const inv = res.data;
  const isCredit = inv.docType === 'credit_note';
  const qrDataUrl = showQr && inv.zatcaQr ? await QRCode.toDataURL(inv.zatcaQr, { margin: 1, width: 160 }) : null;
  const name = ctx.company?.name_ar || ctx.company?.name || inv.sellerName || 'المطعم';
  const logoUrl = (ctx.company as { logo_url?: string | null } | null)?.logo_url ?? null;
  const isCash = inv.paymentMethod === 'cash' || inv.paymentMethod === 'mixed';

  return (
    <div className="mx-auto bg-white text-black" style={{ width: `${widthMm}mm`, maxWidth: '100%' }}>
      {/* Thermal page: no margins, paper-width page box, hairline rows. Scoped to this print. */}
      <style>{`@media print{@page{size:${widthMm}mm auto;margin:0}html,body{margin:0!important;background:#fff}.pos-receipt{width:${widthMm}mm}}`}</style>
      {sp.autoprint === '1' && <AutoPrint />}
      <div className="mb-1 flex justify-end print:hidden"><PrintButton label="طباعة الفاتورة" /></div>

      <div className="pos-receipt space-y-2 px-2 py-1 text-[12px] leading-tight">
        {/* Header */}
        <div className="border-b border-dashed pb-2 text-center">
          {showLogo && logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="mx-auto mb-1 h-12 w-auto object-contain" />
          )}
          <h1 className="text-base font-bold">{name}</h1>
          <p className="text-[10px] font-medium">{isCredit ? 'إشعار دائن' : 'فاتورة ضريبية مبسطة'} · Simplified Tax Invoice</p>
          {inv.sellerVat && <p className="text-[10px] text-gray-600" dir="ltr">VAT: {inv.sellerVat}</p>}
          {ctx.company?.phone && <p className="text-[10px] text-gray-600" dir="ltr">{ctx.company.phone}</p>}
        </div>

        {/* Meta */}
        <div className="flex flex-wrap justify-between gap-x-2 text-[10px] text-gray-700">
          <span dir="ltr">#{inv.invoiceNumber}</span>
          <span dir="ltr">{formatDate(inv.issueAt)}</span>
          <span>{TYPE[inv.orderType ?? ''] ?? inv.orderType}</span>
          {showCashier && inv.cashierName && <span>الكاشير: {inv.cashierName}</span>}
          {inv.customerName && <span>العميل: {inv.customerName}</span>}
        </div>

        {/* Items */}
        <table className="w-full border-collapse">
          <thead><tr className="border-y border-dashed text-[10px]"><th className="p-0.5 text-right">الصنف</th><th className="p-0.5 text-center">كمية</th><th className="p-0.5 text-left">سعر</th><th className="p-0.5 text-left">إجمالي</th></tr></thead>
          <tbody>
            {inv.lines.map((it, i) => (
              <tr key={i} className="border-b border-dotted text-[11px]">
                <td className="p-0.5">{it.name}{it.note ? <span className="block text-[9px] text-gray-500">{it.note}</span> : null}</td>
                <td className="p-0.5 text-center tabular-nums">{it.qty}</td>
                <td className="p-0.5 text-left tabular-nums" dir="ltr">{formatCurrency(it.unitPrice)}</td>
                <td className="p-0.5 text-left tabular-nums" dir="ltr">{formatCurrency(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="space-y-0.5 text-[11px]">
          <Line label="الإجمالي الفرعي" val={inv.subtotal} />
          {inv.discountTotal !== 0 && <Line label="الخصم" val={-Math.abs(inv.discountTotal)} />}
          {inv.serviceTotal !== 0 && <Line label="الخدمة" val={inv.serviceTotal} />}
          {inv.taxTotal !== 0 && <Line label="ضريبة القيمة المضافة (VAT)" val={inv.taxTotal} />}
          <div className="flex justify-between border-t border-dashed pt-1 text-sm font-bold"><span>الإجمالي</span><span className="tabular-nums" dir="ltr">{formatCurrency(inv.grandTotal)}</span></div>
          {inv.paymentMethod && <div className="flex justify-between text-[10px] text-gray-600"><span>طريقة الدفع</span><span>{METHOD[inv.paymentMethod] ?? inv.paymentMethod}</span></div>}
          {isCash && received != null && <Line label="المدفوع" val={received} small />}
          {isCash && change != null && <Line label="الباقي" val={change} small />}
        </div>

        {/* ZATCA QR */}
        {qrDataUrl && (
          <div className="flex flex-col items-center gap-0.5 border-t border-dashed pt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="ZATCA QR" width={120} height={120} />
            <span className="text-[8px] text-gray-400">ZATCA QR</span>
          </div>
        )}

        <p className="pt-1 text-center text-[10px] text-gray-500">شكراً لزيارتكم 🙏</p>
      </div>
    </div>
  );
}

function Line({ label, val, small }: { label: string; val: number; small?: boolean }) {
  return <div className={`flex justify-between ${small ? 'text-[10px] text-gray-600' : ''}`}><span className="text-gray-500">{label}</span><span className="tabular-nums" dir="ltr">{formatCurrency(val)}</span></div>;
}
