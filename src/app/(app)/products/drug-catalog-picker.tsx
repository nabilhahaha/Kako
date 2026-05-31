'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Loader2, X, Plus, Pill, Check } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { searchClinicalReference, type ReferenceItem } from '../clinic/reference-actions';
import { addDrugsToProducts } from './actions';
import { useI18n } from '@/lib/i18n/provider';

/** Search the Egyptian drug reference and bulk-add the picked drugs to the
 *  product catalog — fast way for a pharmacy/clinic to build its inventory. */
export function DrugCatalogPicker() {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ReferenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ReferenceItem[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      setResults(await searchClinicalReference(['drug'], term));
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  function save() {
    startTransition(async () => {
      const res = await addDrugsToProducts(
        selected.map((d) => ({ name: d.name, name_ar: d.name_ar, detail: d.detail, price: d.price ?? 0 })),
      );
      if (!res.ok) { toast.error(res.error ?? t('products.drugPickerToastError')); return; }
      toast.success(
        res.count
          ? t('products.drugPickerToastAdded').replace('{count}', String(res.count))
          : t('products.drugPickerToastAdded').replace('{count}', '0'),
      );
      setSelected([]); setQ(''); setResults([]); setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pill className="h-4 w-4" /> {t('products.btnDrugCatalog')}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]" onClick={() => setOpen(false)}>
          <Card className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Pill className="h-4 w-4" /> {t('products.drugPickerTitle')}
                </h3>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 hover:bg-secondary"
                  aria-label={t('products.drugPickerAriaClose')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('products.drugPickerSearchPlaceholder')}
                  className="pe-9"
                  autoFocus
                />
                {loading && <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
              </div>

              {results.length > 0 && (
                <ul className="max-h-52 overflow-y-auto rounded-md border">
                  {results.map((r, i) => {
                    const picked = selected.some((x) => x.name === r.name);
                    return (
                      <li key={i}>
                        <button
                          onClick={() => setSelected((s) => (picked ? s : [...s, r]))}
                          disabled={picked}
                          className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-start text-sm last:border-0 hover:bg-secondary disabled:opacity-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{r.name}{r.name_ar ? <span className="text-muted-foreground"> — {r.name_ar}</span> : null}</span>
                            {r.detail && <span className="block truncate text-xs text-muted-foreground" dir="ltr">{r.detail}</span>}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {r.price != null && <span className="tabular-nums text-xs" dir="ltr">{formatCurrency(r.price)}</span>}
                            {picked ? <Check className="h-4 w-4 text-success" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {selected.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t('products.drugPickerSelectedLabel').replace('{count}', String(selected.length))}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selected.map((s) => (
                      <span key={s.name} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs">
                        {s.name_ar || s.name}
                        <button
                          onClick={() => setSelected((x) => x.filter((y) => y.name !== s.name))}
                          className="text-destructive"
                          aria-label={t('products.drugPickerAriaRemove')}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={save} disabled={pending || selected.length === 0}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{' '}
                  {selected.length > 0
                    ? t('products.drugPickerBtnAdd').replace('{count}', String(selected.length))
                    : t('products.drugPickerBtnAddEmpty')}
                </Button>
                <Button variant="outline" onClick={() => setOpen(false)}>{t('products.drugPickerBtnClose')}</Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('products.drugPickerHint')}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
