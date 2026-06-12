'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ArrowLeftRight, Trash2 } from 'lucide-react';
import { pharmacySearch, type PharmacySearchRow } from '../pos/actions';
import { branchStock, transferStock, type BranchStockRow } from './actions';

export interface BranchWarehouse { branch_id: string; branch_name: string; branch_name_ar: string | null; warehouse_id: string }
interface TLine { product_id: string; name: string; name_ar: string | null; quantity: number }

export function BranchesManager({ initialRows, branchWarehouses, canTransfer }: {
  initialRows: BranchStockRow[]; branchWarehouses: BranchWarehouse[]; canTransfer: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const nm = (x: { name: string; name_ar: string | null }) => (locale === 'ar' ? x.name_ar || x.name : x.name);
  const bnm = (b: BranchWarehouse) => (locale === 'ar' ? b.branch_name_ar || b.branch_name : b.branch_name);

  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<BranchStockRow[]>(initialRows);

  useEffect(() => {
    const id = setTimeout(async () => setRows(await branchStock(query)), 200);
    return () => clearTimeout(id);
  }, [query]);

  // Pivot rows → product × branch matrix.
  const { branches, matrix } = useMemo(() => {
    const branchMap = new Map<string, { id: string; name: string; name_ar: string | null }>();
    const prodMap = new Map<string, { product_id: string; code: string; name: string; name_ar: string | null; cells: Record<string, number> }>();
    for (const r of rows) {
      branchMap.set(r.branch_id, { id: r.branch_id, name: r.branch_name, name_ar: r.branch_name_ar });
      const p = prodMap.get(r.product_id) ?? { product_id: r.product_id, code: r.code, name: r.name, name_ar: r.name_ar, cells: {} };
      p.cells[r.branch_id] = Number(r.on_hand);
      prodMap.set(r.product_id, p);
    }
    return { branches: [...branchMap.values()], matrix: [...prodMap.values()] };
  }, [rows]);

  // ── Transfer form ──
  const [fromWh, setFromWh] = useState(branchWarehouses[0]?.warehouse_id ?? '');
  const [toWh, setToWh] = useState(branchWarehouses[1]?.warehouse_id ?? '');
  const [tQuery, setTQuery] = useState('');
  const [tResults, setTResults] = useState<PharmacySearchRow[]>([]);
  const [tLines, setTLines] = useState<TLine[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = tQuery.trim();
    if (q.length < 1) { setTResults([]); return; }
    const id = setTimeout(async () => setTResults(await pharmacySearch(q)), 160);
    return () => clearTimeout(id);
  }, [tQuery]);

  function addT(r: PharmacySearchRow) {
    setTQuery(''); setTResults([]);
    if (tLines.some((l) => l.product_id === r.product_id)) return;
    setTLines((p) => [...p, { product_id: r.product_id, name: r.name, name_ar: r.name_ar, quantity: 1 }]);
  }

  async function doTransfer() {
    const from = branchWarehouses.find((b) => b.warehouse_id === fromWh);
    if (!from || !toWh || fromWh === toWh || tLines.length === 0) { toast.error(t('pharmBranches.transferInvalid')); return; }
    setBusy(true);
    const res = await transferStock({
      from_warehouse_id: fromWh, to_warehouse_id: toWh, branch_id: from.branch_id,
      lines: tLines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
    });
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? t('pharmBranches.transferError')); return; }
    toast.success(t('pharmBranches.transferred'));
    setTLines([]);
    setRows(await branchStock(query));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('pharmBranches.search')} className="h-10 ps-9" />
      </div>

      <Card><CardContent className="p-0">
        {matrix.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t('pharmBranches.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">{t('pharmBranches.product')}</th>
                  {branches.map((b) => <th key={b.id} className="p-3 text-end">{nm(b)}</th>)}
                </tr>
              </thead>
              <tbody>
                {matrix.map((p) => (
                  <tr key={p.product_id} className="border-b">
                    <td className="p-3"><div className="font-medium">{nm(p)}</div><div className="font-mono text-xs text-muted-foreground" dir="ltr">{p.code}</div></td>
                    {branches.map((b) => {
                      const v = p.cells[b.id] ?? 0;
                      return <td key={b.id} className={`p-3 text-end tabular-nums ${v <= 0 ? 'text-muted-foreground' : ''}`} dir="ltr">{v}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>

      {canTransfer && branchWarehouses.length >= 2 && (
        <Card><CardContent className="space-y-3 pt-5">
          <h3 className="flex items-center gap-2 font-semibold"><ArrowLeftRight className="h-4 w-4" /> {t('pharmBranches.transfer')}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select value={fromWh} onChange={(e) => setFromWh(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
              {branchWarehouses.map((b) => <option key={b.warehouse_id} value={b.warehouse_id}>{bnm(b)}</option>)}
            </select>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
            <select value={toWh} onChange={(e) => setToWh(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
              {branchWarehouses.map((b) => <option key={b.warehouse_id} value={b.warehouse_id}>{bnm(b)}</option>)}
            </select>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={tQuery} onChange={(e) => setTQuery(e.target.value)} placeholder={t('pharmBranches.addProduct')} className="h-10 ps-9" />
          </div>
          {tResults.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {tResults.map((r) => (
                <button key={r.product_id} onClick={() => addT(r)} className="flex w-full items-center justify-between rounded-md border p-2 text-start text-sm hover:bg-secondary">
                  <span className="truncate">{nm(r)}</span>
                </button>
              ))}
            </div>
          )}
          {tLines.map((l, i) => (
            <div key={l.product_id} className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm">{nm(l)}</span>
              <Input type="number" min="1" value={l.quantity} onChange={(e) => setTLines((arr) => arr.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} className="h-9 w-20 text-end" dir="ltr" />
              <button onClick={() => setTLines((arr) => arr.filter((_, j) => j !== i))} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <Button disabled={busy || tLines.length === 0} onClick={doTransfer}>
            <ArrowLeftRight className="h-4 w-4" /> {t('pharmBranches.doTransfer')}
          </Button>
        </CardContent></Card>
      )}
    </div>
  );
}
