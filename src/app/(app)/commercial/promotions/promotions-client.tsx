'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Plus, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { savePromotion } from './tpm-actions';

export interface Promotion {
  id: string; name: string; promo_type: string; starts_on: string; ends_on: string; budget: number | null; cost: number | null; status: string;
  performance?: { actual_value: number | null } | null;
}
const PROMO_TYPES = ['percentage', 'fixed_amount', 'buy_x_get_y', 'quantity', 'mix_match', 'bundle', 'free_gift'];
const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';
const STATUS_TONE: Record<string, string> = { active: 'border-green-500/50 text-green-700', paused: 'border-amber-500/50 text-amber-700', expired: 'text-muted-foreground', archived: 'text-muted-foreground' };

/** Promotion create form + list with status badges + drill to detail. */
export function PromotionsClient({ promotions, isAdmin }: { promotions: Promotion[]; isAdmin: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);
  const [f, setF] = useState({ name: '', promo_type: 'percentage', starts_on: today, ends_on: monthEnd, budget: '', cost: '' });

  function create() {
    if (!f.name.trim()) return;
    start(async () => {
      const res = await savePromotion({ name: f.name, promo_type: f.promo_type, starts_on: f.starts_on, ends_on: f.ends_on, budget: f.budget ? Number(f.budget) : null, cost: f.cost ? Number(f.cost) : null });
      if (!res.ok) { toast.error(res.error ?? t('commercial.tpm.saveFailed')); return; }
      toast.success(t('commercial.tpm.saved')); setOpen(false);
      if (res.data?.id) router.push(`/commercial/promotions/${res.data.id}`); else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {isAdmin && (
        <Card><CardContent className="p-3">
          {!open ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="me-1 h-4 w-4" />{t('commercial.tpm.new')}</Button> : (
            <div className="space-y-2">
              <Input className="h-9" placeholder={t('commercial.tpm.name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <div className="flex flex-wrap gap-2">
                <select className={selectCls} value={f.promo_type} onChange={(e) => setF({ ...f, promo_type: e.target.value })}>
                  {PROMO_TYPES.map((p) => <option key={p} value={p}>{t(`commercial.tpm.types.${p}`)}</option>)}
                </select>
                <Input className="h-9 w-36" type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} />
                <Input className="h-9 w-36" type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} />
                <Input className="h-9 w-28" type="number" placeholder={t('commercial.tpm.budget')} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
                <Input className="h-9 w-28" type="number" placeholder={t('commercial.tpm.cost')} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={create} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('commercial.tpm.create')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{t('commercial.cancel')}</Button>
              </div>
            </div>
          )}
        </CardContent></Card>
      )}

      {promotions.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('commercial.tpm.empty')}</CardContent></Card>
      ) : (
        <Card><CardContent className="divide-y p-0">
          {promotions.map((p) => (
            <Link key={p.id} href={`/commercial/promotions/${p.id}`} className="block hover:bg-muted/50">
              <div className="flex items-center gap-2 p-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{p.name}</span>
                    <Badge variant="outline" className={STATUS_TONE[p.status]}>{t(`commercial.tpm.st.${p.status}`)}</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{t(`commercial.tpm.types.${p.promo_type}`)} · {p.starts_on?.slice(0, 10)} → {p.ends_on?.slice(0, 10)}</div>
                </div>
                {p.performance?.actual_value != null && <span className="w-20 text-end tabular-nums text-muted-foreground">{Number(p.performance.actual_value).toLocaleString()}</span>}
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" />
              </div>
            </Link>
          ))}
        </CardContent></Card>
      )}
    </div>
  );
}
