import { useMemo, useState, useRef } from 'react';
import type { SalesDataset } from '@/lib/salesTypes';
import { formatSAR, dayIndexToString } from '@/lib/salesDataUtils';

interface Props { dataset: SalesDataset; indices: Uint32Array }

interface InvoiceRow {
  invoiceKey: string;
  date: string;
  customerName: string;
  customerAcct: string;
  salesmanName: string;
  branch: string;
  isReturn: boolean;
  lines: { skuName: string; skuCode: string; category: string; qty: number; sales: number; discount: number }[];
  totalSales: number;
  totalDiscount: number;
  totalQty: number;
}

export function InvoiceTab({ dataset, indices }: Props) {
  const [search, setSearch] = useState('');
  const [selectedInv, setSelectedInv] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const invoices = useMemo(() => {
    const { data, customers, skus, salesmen, dims } = dataset;
    const invMap = new Map<string, InvoiceRow>();

    for (const i of indices) {
      const cu = customers[data.cu[i]];
      const sk = skus[data.sk[i]];
      const sm = salesmen[data.sm[i]];
      const dateStr = dayIndexToString(data.d[i]);
      const key = `${dateStr}_${cu.acct}_${sm.n}_${data.r[i]}`;

      if (!invMap.has(key)) {
        invMap.set(key, {
          invoiceKey: key, date: dateStr,
          customerName: cu.n, customerAcct: cu.acct,
          salesmanName: sm.n,
          branch: dims.branches[cu.br] ?? '',
          isReturn: data.r[i] === 1,
          lines: [], totalSales: 0, totalDiscount: 0, totalQty: 0,
        });
      }
      const inv = invMap.get(key)!;
      inv.lines.push({
        skuName: sk.d, skuCode: sk.iid,
        category: dims.categories[sk.c] ?? '',
        qty: data.q[i], sales: data.s[i], discount: Math.abs(data.di[i]),
      });
      inv.totalSales += data.s[i];
      inv.totalDiscount += Math.abs(data.di[i]);
      inv.totalQty += data.q[i];
    }

    return [...invMap.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [dataset, indices]);

  const filtered = useMemo(() => {
    if (!search.trim()) return invoices.slice(0, 200);
    const kw = search.toLowerCase();
    return invoices.filter(inv =>
      inv.customerName.toLowerCase().includes(kw) ||
      inv.customerAcct.toLowerCase().includes(kw) ||
      inv.salesmanName.toLowerCase().includes(kw) ||
      inv.date.includes(kw)
    ).slice(0, 200);
  }, [invoices, search]);

  const selected = selectedInv ? invoices.find(i => i.invoiceKey === selectedInv) : null;

  function handlePrint() {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Invoice</title>
      <style>
        body { font-family: -apple-system, 'Segoe UI', sans-serif; padding: 30px; color: #1a1a1a; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: left; font-size: 13px; }
        th { background: #f5f5f5; font-weight: 700; }
        .text-end { text-align: right; }
        .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .title { font-size: 20px; font-weight: 900; }
        .meta { font-size: 12px; color: #666; }
        .return-tag { background: #fee; color: #c33; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; }
        .total-row { font-weight: 700; background: #f9f9f9; }
        @media print { body { padding: 10px; } }
      </style></head><body>${printRef.current.innerHTML}
      <script>window.print(); window.onafterprint = () => window.close();<\/script>
      </body></html>`);
    printWindow.document.close();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="p-3 border-b">
            <input type="text" placeholder="Search by customer, salesman, date..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background" />
            <div className="text-[10px] text-muted-foreground mt-1">{filtered.length} of {invoices.length} invoices</div>
          </div>
          <div className="overflow-y-auto max-h-[600px]">
            {filtered.map(inv => (
              <button key={inv.invoiceKey} onClick={() => setSelectedInv(inv.invoiceKey)}
                className={`w-full text-start px-4 py-2.5 border-b text-sm hover:bg-muted/50 transition-colors ${
                  selectedInv === inv.invoiceKey ? 'bg-primary/10 border-s-2 border-s-primary' : ''
                }`}>
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate flex-1">{inv.customerName}</span>
                  {inv.isReturn && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-bold">RET</span>}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
                  <span>{inv.date} • {inv.salesmanName}</span>
                  <span className={inv.isReturn ? 'text-red-500' : 'text-emerald-600'}>{formatSAR(Math.abs(inv.totalSales))}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-3">
          {!selected ? (
            <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
              <div className="text-4xl mb-3">📄</div>
              <p>Select an invoice from the list to view details</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-end gap-2">
                <button onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                  🖨️ Print Invoice
                </button>
              </div>
              <div ref={printRef} className="bg-card rounded-xl border p-6">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <div className="text-lg font-black">ROSHEN KSA</div>
                    <div className="text-xs text-muted-foreground">Sales {selected.isReturn ? 'Credit Note' : 'Invoice'}</div>
                  </div>
                  <div className="text-end">
                    {selected.isReturn && <span className="return-tag inline-block px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs font-bold mb-1">RETURN</span>}
                    <div className="text-sm font-bold">{selected.date}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Customer</div>
                    <div className="font-bold">{selected.customerName}</div>
                    <div className="text-xs text-muted-foreground">{selected.customerAcct}</div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Salesman</div>
                    <div className="font-bold">{selected.salesmanName}</div>
                    <div className="text-xs text-muted-foreground">{selected.branch}</div>
                  </div>
                </div>

                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-start px-3 py-2 border font-semibold">#</th>
                      <th className="text-start px-3 py-2 border font-semibold">Item</th>
                      <th className="text-start px-3 py-2 border font-semibold">Category</th>
                      <th className="text-end px-3 py-2 border font-semibold">Qty</th>
                      <th className="text-end px-3 py-2 border font-semibold">Discount</th>
                      <th className="text-end px-3 py-2 border font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map((line, idx) => (
                      <tr key={idx} className="border-t hover:bg-muted/20">
                        <td className="px-3 py-1.5 border text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-1.5 border">
                          <div className="font-medium text-xs">{line.skuName}</div>
                          <div className="text-[10px] text-muted-foreground">{line.skuCode}</div>
                        </td>
                        <td className="px-3 py-1.5 border text-xs">{line.category}</td>
                        <td className="px-3 py-1.5 border text-end font-mono">{line.qty}</td>
                        <td className="px-3 py-1.5 border text-end font-mono text-orange-500">
                          {line.discount > 0 ? formatSAR(line.discount) : '—'}
                        </td>
                        <td className={`px-3 py-1.5 border text-end font-mono font-bold ${selected.isReturn ? 'text-red-500' : ''}`}>
                          {formatSAR(Math.abs(line.sales))}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/30 font-bold">
                      <td colSpan={3} className="px-3 py-2 border text-end">TOTAL</td>
                      <td className="px-3 py-2 border text-end font-mono">{selected.totalQty}</td>
                      <td className="px-3 py-2 border text-end font-mono text-orange-500">{selected.totalDiscount > 0 ? formatSAR(selected.totalDiscount) : '—'}</td>
                      <td className={`px-3 py-2 border text-end font-mono ${selected.isReturn ? 'text-red-500' : 'text-emerald-600'}`}>{formatSAR(Math.abs(selected.totalSales))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
