'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, Trash2, PackagePlus } from 'lucide-react';
import { searchGlobalCatalog, onboardMedicines, type GlobalDrug, type OnboardItem } from './actions';

const UNITS = ['tablet', 'strip', 'box', 'bottle', 'tube', 'vial', 'sachet', 'ml', 'piece', 'unit'];

export function OnboardingManager() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalDrug[]>([]);
  const [picked, setPicked] = useState<OnboardItem[]>([]);
  const [pending, start] = useTransition();
  const nm = (x: { name: string; name_ar: string | null }) => (locale === 'ar' ? x.name_ar || x.name : x.name);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const id = setTimeout(async () => setResults(await searchGlobalCatalog(q)), 180);
    return () => clearTimeout(id);
  }, [query]);

  function add(d: GlobalDrug) {
    if (picked.some((p) => p.ref_id === d.id)) return;
    setPicked((p) => [...p, {
      ref_id: d.id, name: d.name, name_ar: d.name_ar, active_ingredient: d.active_ingredient,
      barcode: d.barcode, sell_price: Number(d.price) || 0, cost_price: 0, min_stock: 0, base_uom: 'tablet',
    }]);
  }
  const patch = (i: number, p: Partial<OnboardItem>) => setPicked((arr) => arr.map((x, j) => (j === i ? { ...x, ...p } : x)));

  function save() {
    if (!picked.length) return;
    start(async () => {
      const res = await onboardMedicines(picked);
      if (!res.ok) { toast.error(res.error ?? t('pharmOnboard.error')); return; }
      toast.success(t('pharmOnboard.added', { count: String(res.count ?? 0) }));
      setPicked([]); setQuery(''); setResults([]);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('pharmOnboard.search')} className="h-11 ps-9" autoFocus />
        </div>
        <Card><CardContent className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
          {results.map((d) => (
            <button key={d.id} onClick={() => add(d)} disabled={picked.some((p) => p.ref_id === d.id)}
              className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-start text-sm hover:bg-secondary disabled:opacity-40">
              <span className="min-w-0">
                <span className="block truncate font-medium">{nm(d)}</span>
                {d.active_ingredient && <span className="block truncate text-[11px] text-muted-foreground">{d.active_ingredient}</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-primary" dir="ltr">{d.price ?? '—'}</span>
                <Plus className="h-4 w-4" />
              </span>
            </button>
          ))}
          {query.trim().length >= 2 && results.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">{t('pharmOnboard.noResults')}</p>
          )}
          {query.trim().length < 2 && <p className="p-4 text-center text-sm text-muted-foreground">{t('pharmOnboard.hint')}</p>}
        </CardContent></Card>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{t('pharmOnboard.selected')} ({picked.length})</h3>
          <Button disabled={!picked.length || pending} onClick={save}>
            <PackagePlus className="h-4 w-4" /> {t('pharmOnboard.addBtn')}
          </Button>
        </div>
        <Card><CardContent className="max-h-[64vh] space-y-2 overflow-y-auto p-3">
          {picked.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('pharmOnboard.empty')}</p>
          ) : picked.map((it, i) => (
            <div key={it.ref_id} className="space-y-1.5 border-b pb-2 last:border-0">
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-medium">{locale === 'ar' ? it.name_ar || it.name : it.name}</span>
                <button onClick={() => setPicked((p) => p.filter((_, j) => j !== i))} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="text-[11px] text-muted-foreground">{t('pharmOnboard.sell')}
                  <Input type="number" step="0.01" value={it.sell_price} onChange={(e) => patch(i, { sell_price: Number(e.target.value) })} className="mt-0.5 h-8" dir="ltr" /></label>
                <label className="text-[11px] text-muted-foreground">{t('pharmOnboard.cost')}
                  <Input type="number" step="0.01" value={it.cost_price} onChange={(e) => patch(i, { cost_price: Number(e.target.value) })} className="mt-0.5 h-8" dir="ltr" /></label>
                <label className="text-[11px] text-muted-foreground">{t('pharmOnboard.minStock')}
                  <Input type="number" value={it.min_stock} onChange={(e) => patch(i, { min_stock: Number(e.target.value) })} className="mt-0.5 h-8" dir="ltr" /></label>
                <label className="text-[11px] text-muted-foreground">{t('pharmOnboard.baseUnit')}
                  <select value={it.base_uom} onChange={(e) => patch(i, { base_uom: e.target.value })} className="mt-0.5 h-8 w-full rounded-md border border-input bg-background px-1 text-sm">
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select></label>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={it.is_controlled ?? false} onChange={(e) => patch(i, { is_controlled: e.target.checked })} className="h-3.5 w-3.5" />
                {t('pharmOnboard.controlled')}
              </label>
            </div>
          ))}
        </CardContent></Card>
      </div>
    </div>
  );
}
