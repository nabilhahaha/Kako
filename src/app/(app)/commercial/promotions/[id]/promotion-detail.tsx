'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, X, RefreshCw } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { addTarget, removeTarget, setPromotionStatus, refreshPerformance } from '../tpm-actions';

interface Target { dim_type: string; dim_id: string | null; label: string | null }
interface Actuals { actual_value: number | null; actual_qty: number | null; budget: number | null; cost: number | null; target_value: number | null; target_qty: number | null; achievement_value: number | null; achievement_qty: number | null }
export interface PromotionFull {
  id: string; name: string; promo_type: string; params: Record<string, unknown>; starts_on: string; ends_on: string;
  budget: number | null; cost: number | null; target_value: number | null; target_qty: number | null; status: string;
  targets: Target[]; actuals: Actuals | null;
}
const DIMS = ['company', 'region', 'area', 'branch', 'route', 'rep', 'channel', 'classification', 'customer', 'category', 'subcategory', 'brand', 'sku'];
// lifecycle actions available per current status
const NEXT: Record<string, { s: string; k: string }[]> = {
  draft: [{ s: 'approved', k: 'approve' }, { s: 'archived', k: 'archive' }],
  approved: [{ s: 'active', k: 'activate' }, { s: 'archived', k: 'archive' }],
  active: [{ s: 'paused', k: 'pause' }, { s: 'expired', k: 'expire' }, { s: 'archived', k: 'archive' }],
  paused: [{ s: 'active', k: 'resume' }, { s: 'expired', k: 'expire' }, { s: 'archived', k: 'archive' }],
  expired: [{ s: 'archived', k: 'archive' }],
  archived: [],
};
const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';
const n = (x: number | null | undefined) => (x == null ? '—' : Number(x).toLocaleString());

export function PromotionDetail({ promo, isAdmin }: { promo: PromotionFull; isAdmin: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dim, setDim] = useState('channel');
  const [ref, setRef] = useState('');

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => start(async () => {
    const r = await fn();
    if (!r.ok) { toast.error(r.error ?? t('commercial.tpm.saveFailed')); return; }
    if (okMsg) toast.success(okMsg); setRef(''); router.refresh();
  });
  const a = promo.actuals;

  return (
    <div className="space-y-3">
      {/* header */}
      <Card><CardContent className="flex flex-wrap items-center gap-2 p-3 text-sm">
        <Badge variant="secondary">{t(`commercial.tpm.types.${promo.promo_type}`)}</Badge>
        <Badge variant="outline">{t(`commercial.tpm.st.${promo.status}`)}</Badge>
        <span className="text-muted-foreground">{promo.starts_on?.slice(0, 10)} → {promo.ends_on?.slice(0, 10)}</span>
      </CardContent></Card>

      {/* lifecycle actions */}
      {isAdmin && NEXT[promo.status]?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {NEXT[promo.status].map((x) => (
            <Button key={x.s} size="sm" variant={x.k === 'archive' || x.k === 'expire' ? 'ghost' : 'outline'} disabled={pending}
              onClick={() => run(() => setPromotionStatus(promo.id, x.s), t('commercial.tpm.saved'))}>{t(`commercial.tpm.actions.${x.k}`)}</Button>
          ))}
        </div>
      )}

      {/* performance */}
      <Card><CardContent className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{t('commercial.tpm.perf.title')}</span>
          {isAdmin && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => refreshPerformance(promo.id), t('commercial.tpm.saved'))}><RefreshCw className="me-1 h-3.5 w-3.5" />{t('commercial.tpm.perf.refresh')}</Button>}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label={t('commercial.tpm.budget')} value={n(a?.budget)} />
          <Stat label={t('commercial.tpm.cost')} value={n(a?.cost)} />
          <Stat label={t('commercial.tpm.perf.actualValue')} value={n(a?.actual_value)} />
          <Stat label={t('commercial.tpm.perf.actualQty')} value={n(a?.actual_qty)} />
          <Stat label={t('commercial.tpm.perf.achValue')} value={a?.achievement_value != null ? `${a.achievement_value}%` : '—'} />
          <Stat label={t('commercial.tpm.perf.achQty')} value={a?.achievement_qty != null ? `${a.achievement_qty}%` : '—'} />
        </div>
      </CardContent></Card>

      {/* audience builder */}
      <Card><CardContent className="space-y-2 p-3">
        <div className="text-xs font-medium">{t('commercial.tpm.audience.title')}</div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <select className={selectCls} value={dim} onChange={(e) => setDim(e.target.value)}>
              {DIMS.map((d) => <option key={d} value={d}>{t(`commercial.dims.${d}`)}</option>)}
            </select>
            <Input className="h-9 w-44" placeholder={t('commercial.tpm.audience.ref')} value={ref} onChange={(e) => setRef(e.target.value)} title={t('commercial.tpm.audience.refHint')} />
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => addTarget(promo.id, dim, ref || null), t('commercial.tpm.saved'))}><Plus className="me-1 h-3.5 w-3.5" />{t('commercial.tpm.audience.add')}</Button>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {promo.targets.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : promo.targets.map((tg, i) => (
            <Badge key={i} variant="secondary" className="gap-1">
              {t(`commercial.dims.${tg.dim_type}`)}{tg.label ? `: ${tg.label}` : ''}
              {isAdmin && <button onClick={() => run(() => removeTarget(promo.id, tg.dim_type, tg.dim_id))} className="ms-0.5"><X className="h-3 w-3" /></button>}
            </Badge>
          ))}
        </div>
      </CardContent></Card>

      {pending && <div className="flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-muted/50 p-2"><div className="text-sm font-semibold tabular-nums">{value}</div><div className="text-[10px] text-muted-foreground">{label}</div></div>;
}
