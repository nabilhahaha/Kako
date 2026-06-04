'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, Power, Tag, Package, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import {
  createMslLevel, deleteMslLevel, createMslPolicy, updateMslPolicy, setMslPolicyActive,
  deleteMslPolicy, addMslCondition, removeMslCondition, addMslItem, removeMslItem,
} from './actions';

export interface MslData {
  levels: { id: string; code: string; name: string; name_ar: string | null; weight: number; is_active: boolean }[];
  policies: { id: string; name: string; name_ar: string | null; priority: number; effective_from: string | null; effective_to: string | null; is_active: boolean }[];
  conditions: { id: string; policy_id: string; lookup_id: string }[];
  items: { id: string; policy_id: string; product_id: string; level_id: string | null; weight: number | null }[];
  lookups: { id: string; kind: string; name: string; name_ar: string | null }[];
  products: { id: string; code: string | null; name: string }[];
}

const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

export function MslManager({ data }: { data: MslData }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const lookupById = useMemo(() => new Map(data.lookups.map((l) => [l.id, l])), [data.lookups]);
  const productById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);
  const levelById = useMemo(() => new Map(data.levels.map((l) => [l.id, l])), [data.levels]);
  const kinds = useMemo(() => [...new Set(data.lookups.map((l) => l.kind))], [data.lookups]);
  const lname = (l: { name: string; name_ar: string | null }) => (locale === 'ar' && l.name_ar) ? l.name_ar : l.name;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? t('retail.msl.error')); return false; }
      toast.success(t('retail.msl.saved'));
      router.refresh();
      return true;
    } finally { setBusy(false); }
  }

  // ── Level add form ──
  const [lvCode, setLvCode] = useState(''); const [lvName, setLvName] = useState(''); const [lvWeight, setLvWeight] = useState('1');
  // ── Policy add form ──
  const [pName, setPName] = useState(''); const [pPriority, setPPriority] = useState('0');

  return (
    <div className="space-y-6">
      {/* Levels */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4" /> {t('retail.msl.levels')}</h2>
          <div className="flex flex-wrap gap-2">
            {data.levels.map((l) => (
              <Badge key={l.id} variant="secondary" className="gap-1">
                {lname(l)} · {t('retail.msl.weight')} {l.weight}
                <button type="button" onClick={() => run(() => deleteMslLevel(l.id))} className="ms-1 text-destructive">×</button>
              </Badge>
            ))}
            {data.levels.length === 0 && <span className="text-xs text-muted-foreground">{t('retail.msl.noLevels')}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input className="h-9 w-24" placeholder={t('retail.msl.code')} value={lvCode} onChange={(e) => setLvCode(e.target.value)} />
            <Input className="h-9 w-40" placeholder={t('retail.msl.name')} value={lvName} onChange={(e) => setLvName(e.target.value)} />
            <Input className="h-9 w-20" type="number" placeholder={t('retail.msl.weight')} value={lvWeight} onChange={(e) => setLvWeight(e.target.value)} />
            <Button size="sm" variant="secondary" disabled={busy || !lvCode || !lvName}
              onClick={async () => { if (await run(() => createMslLevel({ code: lvCode, name: lvName, weight: Number(lvWeight) || 1 }))) { setLvCode(''); setLvName(''); setLvWeight('1'); } }}>
              <Plus className="h-4 w-4" /> {t('retail.msl.addLevel')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add policy */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <Input className="h-9 w-56" placeholder={t('retail.msl.name')} value={pName} onChange={(e) => setPName(e.target.value)} />
          <Input className="h-9 w-24" type="number" placeholder={t('retail.msl.priority')} value={pPriority} onChange={(e) => setPPriority(e.target.value)} />
          <Button size="sm" disabled={busy || !pName}
            onClick={async () => { if (await run(() => createMslPolicy({ name: pName, priority: Number(pPriority) || 0 }))) { setPName(''); setPPriority('0'); } }}>
            <Plus className="h-4 w-4" /> {t('retail.msl.addPolicy')}
          </Button>
        </CardContent>
      </Card>

      {/* Policies */}
      {data.policies.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('retail.msl.empty')}</CardContent></Card>
      ) : data.policies.map((p) => (
        <PolicyCard
          key={p.id} policy={p}
          conditions={data.conditions.filter((c) => c.policy_id === p.id)}
          items={data.items.filter((i) => i.policy_id === p.id)}
          kinds={kinds} lookups={data.lookups} products={data.products} levels={data.levels}
          lookupById={lookupById} productById={productById} levelById={levelById}
          busy={busy} run={run}
        />
      ))}
    </div>
  );
}

function PolicyCard({
  policy, conditions, items, kinds, lookups, products, levels,
  lookupById, productById, levelById, busy, run,
}: {
  policy: MslData['policies'][number];
  conditions: MslData['conditions']; items: MslData['items'];
  kinds: string[]; lookups: MslData['lookups']; products: MslData['products']; levels: MslData['levels'];
  lookupById: Map<string, MslData['lookups'][number]>; productById: Map<string, MslData['products'][number]>; levelById: Map<string, MslData['levels'][number]>;
  busy: boolean; run: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;
}) {
  const { t, locale } = useI18n();
  const lname = (l: { name: string; name_ar: string | null }) => (locale === 'ar' && l.name_ar) ? l.name_ar : l.name;
  const [condKind, setCondKind] = useState(kinds[0] ?? '');
  const [condValue, setCondValue] = useState('');
  const [itemProduct, setItemProduct] = useState('');
  const [itemLevel, setItemLevel] = useState('');
  const [itemWeight, setItemWeight] = useState('');
  const valuesForKind = lookups.filter((l) => l.kind === condKind);

  // Group conditions by dimension for display.
  const byKind = new Map<string, { id: string; label: string }[]>();
  for (const c of conditions) {
    const lk = lookupById.get(c.lookup_id); if (!lk) continue;
    (byKind.get(lk.kind) ?? byKind.set(lk.kind, []).get(lk.kind)!).push({ id: c.id, label: lname(lk) });
  }

  return (
    <Card className={policy.is_active ? '' : 'opacity-60'}>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium">
            {policy.name}
            <span className="ms-2 text-xs text-muted-foreground">{t('retail.msl.priority')} {policy.priority}</span>
            {!policy.is_active && <Badge variant="secondary" className="ms-2">{t('retail.msl.inactive')}</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">{t('retail.msl.effectiveFrom')}
              <input type="date" defaultValue={policy.effective_from ?? ''} className={`${selectCls} ms-1`}
                onBlur={(e) => run(() => updateMslPolicy(policy.id, { effectiveFrom: e.target.value || null }))} />
            </label>
            <label className="text-xs text-muted-foreground">{t('retail.msl.effectiveTo')}
              <input type="date" defaultValue={policy.effective_to ?? ''} className={`${selectCls} ms-1`}
                onBlur={(e) => run(() => updateMslPolicy(policy.id, { effectiveTo: e.target.value || null }))} />
            </label>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => setMslPolicyActive(policy.id, !policy.is_active))}>
              <Power className="h-4 w-4" /> {policy.is_active ? t('retail.msl.disable') : t('retail.msl.enable')}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => deleteMslPolicy(policy.id))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Conditions */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Tag className="h-3.5 w-3.5" /> {t('retail.msl.conditions')}</div>
          {byKind.size === 0 ? (
            <div className="text-xs text-muted-foreground">{t('retail.msl.companyWide')}</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {[...byKind.entries()].map(([kind, vals]) => (
                <span key={kind} className="rounded-md border px-2 py-1 text-xs">
                  <span className="font-medium">{kind}:</span>{' '}
                  {vals.map((v) => (
                    <Badge key={v.id} variant="secondary" className="ms-1 gap-1">{v.label}
                      <button type="button" className="text-destructive" onClick={() => run(() => removeMslCondition(v.id))}>×</button>
                    </Badge>
                  ))}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select className={selectCls} value={condKind} onChange={(e) => { setCondKind(e.target.value); setCondValue(''); }}>
              {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <select className={selectCls} value={condValue} onChange={(e) => setCondValue(e.target.value)}>
              <option value="">{t('retail.msl.value')}</option>
              {valuesForKind.map((l) => <option key={l.id} value={l.id}>{lname(l)}</option>)}
            </select>
            <Button size="sm" variant="secondary" disabled={busy || !condValue}
              onClick={async () => { if (await run(() => addMslCondition(policy.id, condValue))) setCondValue(''); }}>
              <Plus className="h-4 w-4" /> {t('retail.msl.addCondition')}
            </Button>
          </div>
        </div>

        {/* Items */}
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Package className="h-3.5 w-3.5" /> {t('retail.msl.items')}</div>
          <div className="flex flex-wrap gap-2">
            {items.map((i) => {
              const prod = productById.get(i.product_id); const lvl = i.level_id ? levelById.get(i.level_id) : null;
              return (
                <Badge key={i.id} variant="secondary" className="gap-1">
                  {prod ? (prod.code ? `${prod.code} · ` : '') + prod.name : i.product_id.slice(0, 6)}
                  {lvl && <span className="text-muted-foreground"> · {lname(lvl)}</span>}
                  {i.weight != null && <span className="text-muted-foreground"> · w{i.weight}</span>}
                  <button type="button" className="text-destructive" onClick={() => run(() => removeMslItem(i.id))}>×</button>
                </Badge>
              );
            })}
            {items.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${selectCls} max-w-[16rem]`} value={itemProduct} onChange={(e) => setItemProduct(e.target.value)}>
              <option value="">{t('retail.msl.product')}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ''}{p.name}</option>)}
            </select>
            <select className={selectCls} value={itemLevel} onChange={(e) => setItemLevel(e.target.value)}>
              <option value="">{t('retail.msl.level')}</option>
              {levels.map((l) => <option key={l.id} value={l.id}>{lname(l)}</option>)}
            </select>
            <Input className="h-9 w-20" type="number" placeholder={t('retail.msl.weight')} value={itemWeight} onChange={(e) => setItemWeight(e.target.value)} />
            <Button size="sm" variant="secondary" disabled={busy || !itemProduct}
              onClick={async () => { if (await run(() => addMslItem({ policyId: policy.id, productId: itemProduct, levelId: itemLevel || null, weight: itemWeight === '' ? null : Number(itemWeight) }))) { setItemProduct(''); setItemLevel(''); setItemWeight(''); } }}>
              <Plus className="h-4 w-4" /> {t('retail.msl.addItem')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
