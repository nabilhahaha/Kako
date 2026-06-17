'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { inventoryValuation, setOfficialMethod, type ValuationRow, type ValuationMethod } from './actions';

type View = 'official' | 'fifo' | 'moving_avg';

export function ValuationView({ initialRows, officialMethod, canManage, intlLocale }: {
  initialRows: ValuationRow[];
  officialMethod: ValuationMethod;
  canManage: boolean;
  intlLocale: string;
}) {
  const { t, locale } = useI18n();
  const money = (n: number | null | undefined) => formatCurrency(Number(n ?? 0), 'EGP', intlLocale);
  const nm = (x: { name: string; name_ar: string | null }) => (locale === 'ar' ? x.name_ar || x.name : x.name);

  const [official, setOfficial] = useState<ValuationMethod>(officialMethod);
  const [view, setView] = useState<View>('official');
  const [rows, setRows] = useState<ValuationRow[]>(initialRows);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const methodLabel = (m: ValuationMethod) => t(`pharmValuation.method.${m}`);
  const total = rows.reduce((s, r) => s + Number(r.total_value || 0), 0);
  const isComparison = view !== 'official' && view !== official;

  async function load(v: View) {
    setView(v);
    setLoading(true);
    const method = v === 'official' ? 'official' : v;
    setRows(await inventoryValuation(method));
    setLoading(false);
  }

  async function changeOfficial(m: ValuationMethod) {
    if (m === official) return;
    setSaving(true);
    const res = await setOfficialMethod(m);
    setSaving(false);
    if (!res.ok) { toast.error(res.error ?? t('pharmValuation.saveError')); return; }
    setOfficial(m);
    toast.success(t('pharmValuation.saved'));
    if (view === 'official') { setLoading(true); setRows(await inventoryValuation('official')); setLoading(false); }
  }

  return (
    <div className="space-y-4">
      {/* Official method — the source of truth */}
      <Card><CardContent className="flex flex-wrap items-center gap-3 pt-6">
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">{t('pharmValuation.officialMethod')}</div>
          <div className="flex items-center gap-2 text-lg font-bold">
            {methodLabel(official)}
            <Badge variant="success">{t('pharmValuation.official')}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('pharmValuation.officialHint')}</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {(['fifo', 'moving_avg'] as ValuationMethod[]).map((m) => (
              <Button key={m} size="sm" variant={official === m ? 'default' : 'outline'} disabled={saving} onClick={() => changeOfficial(m)}>
                {official === m && <CheckCircle2 className="h-3.5 w-3.5" />} {methodLabel(m)}
              </Button>
            ))}
          </div>
        )}
      </CardContent></Card>

      {/* View selector — comparison only */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t('pharmValuation.view')}:</span>
        {(['official', 'fifo', 'moving_avg'] as View[]).map((v) => (
          <button key={v} onClick={() => load(v)}
            className={`rounded-full px-3 py-1 text-sm ${view === v ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
            {v === 'official' ? t('pharmValuation.viewOfficial') : methodLabel(v)}
          </button>
        ))}
        {isComparison && <Badge variant="outline" className="text-amber-600">{t('pharmValuation.comparisonOnly')}</Badge>}
      </div>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t('pharmValuation.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">{t('pharmValuation.product')}</th>
                  <th className="p-3 text-end">{t('pharmValuation.onHand')}</th>
                  <th className="p-3 text-end">{t('pharmValuation.unitCost')}</th>
                  <th className="p-3 text-end">{t('pharmValuation.totalValue')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.product_id} className="border-b">
                    <td className="p-3">
                      <div className="font-medium">{nm(r)}</div>
                      <div className="font-mono text-xs text-muted-foreground" dir="ltr">{r.code}</div>
                    </td>
                    <td className="p-3 text-end tabular-nums" dir="ltr">{Number(r.on_hand)}</td>
                    <td className="p-3 text-end tabular-nums text-muted-foreground" dir="ltr">{money(r.unit_cost)}</td>
                    <td className="p-3 text-end tabular-nums font-medium" dir="ltr">{money(r.total_value)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/30 font-bold">
                <tr>
                  <td className="p-3" colSpan={3}>{t('pharmValuation.grandTotal')} · {rows.length}</td>
                  <td className="p-3 text-end tabular-nums" dir="ltr">{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
