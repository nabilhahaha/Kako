'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Loader2, Power, Pencil, Trash2, X } from 'lucide-react';
import type {
  Area, Branch, CustomerLookup, ErpCustomer, PriceChangeLogEntry, PriceList, PriceListItem,
  PriceRule, PriceScopeType, ProductCatalog, Region,
} from '@/lib/erp/types';
import { useI18n } from '@/lib/i18n/provider';
import { useConfirm } from '@/components/confirm-dialog';
import { useCriticalAction } from '@/lib/critical-action';
import {
  upsertPriceRule, togglePriceRuleActive, deletePriceRule, upsertPriceList, upsertPriceListItem,
} from './actions';

type Product = Pick<ProductCatalog, 'id' | 'code' | 'name' | 'name_ar'>;
type Customer = Pick<ErpCustomer, 'id' | 'name' | 'name_ar'>;
// Pilot-first: customer-specific pricing is the primary rule scope (alongside
// price lists + base). The advanced dimensions stay fully supported by the engine
// but are revealed on demand to keep day-to-day pricing simple.
const PRIMARY_SCOPES: PriceScopeType[] = ['customer'];
const ADVANCED_SCOPES: PriceScopeType[] = ['segment', 'channel', 'tier', 'branch', 'region', 'area', 'global'];
const SCOPE_TYPES: PriceScopeType[] = [...PRIMARY_SCOPES, ...ADVANCED_SCOPES];
const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

export function PricingManager(props: {
  rules: PriceRule[]; lists: PriceList[]; items: PriceListItem[]; products: Product[];
  customers: Customer[]; lookups: CustomerLookup[]; tiers: { id: string; name: string }[];
  branches: Branch[]; regions: Region[]; areas: Area[]; history: PriceChangeLogEntry[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const confirm = useConfirm();
  const ar = locale === 'ar';
  const [tab, setTab] = useState<'rules' | 'lists' | 'history'>('rules');
  const [pending, startTransition] = useTransition();

  const nm = (x: { name: string; name_ar?: string | null }) => (ar ? x.name_ar || x.name : x.name);
  const productName = (id: string | null) => {
    const p = props.products.find((x) => x.id === id);
    return p ? `${p.code} · ${ar ? p.name_ar || p.name : p.name}` : '—';
  };
  const segments = props.lookups.filter((l) => l.kind === 'segment');
  const channels = props.lookups.filter((l) => l.kind === 'channel');

  const scopeOptions = (st: PriceScopeType): { id: string; label: string }[] => {
    switch (st) {
      case 'customer': return props.customers.map((c) => ({ id: c.id, label: nm(c) }));
      case 'segment': return segments.map((l) => ({ id: l.id, label: nm(l) }));
      case 'channel': return channels.map((l) => ({ id: l.id, label: nm(l) }));
      case 'tier': return props.tiers.map((x) => ({ id: x.id, label: x.name }));
      case 'branch': return props.branches.map((b) => ({ id: b.id, label: nm(b) }));
      case 'region': return props.regions.map((r) => ({ id: r.id, label: nm(r) }));
      case 'area': return props.areas.map((a) => ({ id: a.id, label: nm(a) }));
      default: return [];
    }
  };
  const scopeName = (st: string, id: string | null) => {
    const opt = scopeOptions(st as PriceScopeType).find((o) => o.id === id);
    return opt ? opt.label : t(`pricing.scope_${st}` as 'pricing.scope_global');
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {(['rules', 'lists', 'history'] as const).map((x) => (
          <button key={x} onClick={() => setTab(x)}
            className={`rounded-full px-3 py-1 text-sm ${tab === x ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
            {t(`pricing.tab_${x}` as 'pricing.tab_rules')}
          </button>
        ))}
      </div>

      {tab === 'rules' && (
        <RulesSection {...props} pending={pending} startTransition={startTransition}
          scopeOptions={scopeOptions} scopeName={scopeName} productName={productName}
          confirm={confirm} router={router} />
      )}
      {tab === 'lists' && (
        <ListsSection lists={props.lists} items={props.items} products={props.products}
          branches={props.branches} pending={pending} startTransition={startTransition}
          productName={productName} nm={nm} router={router} />
      )}
      {tab === 'history' && (
        <Card><CardContent className="p-0">
          {props.history.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('pricing.emptyHistory')}</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
                <th className="p-3 text-start font-medium">{t('pricing.colProduct')}</th>
                <th className="p-3 text-start font-medium">{t('pricing.colScope')}</th>
                <th className="p-3 text-start font-medium">{t('pricing.colChange')}</th>
                <th className="p-3 text-start font-medium">{t('pricing.colChangedAt')}</th>
              </tr></thead>
              <tbody>{props.history.map((h) => (
                <tr key={h.id} className="border-b last:border-0">
                  <td className="p-3">{productName(h.product_id)}</td>
                  <td className="p-3 text-muted-foreground">{h.scope_type ? scopeName(h.scope_type, h.scope_id) : '—'}</td>
                  <td className="p-3 tabular-nums" dir="ltr">{h.old_value ?? '—'} → {h.new_value ?? '—'} <span className="text-xs text-muted-foreground">({h.price_type})</span></td>
                  <td className="p-3 text-muted-foreground" dir="ltr">{new Date(h.changed_at).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </CardContent></Card>
      )}
    </div>
  );
}

function RulesSection({
  rules, products, pending, startTransition, scopeOptions, scopeName, productName, confirm, router,
}: {
  rules: PriceRule[]; products: Product[]; pending: boolean;
  startTransition: React.TransitionStartFunction;
  scopeOptions: (st: PriceScopeType) => { id: string; label: string }[];
  scopeName: (st: string, id: string | null) => string;
  productName: (id: string | null) => string;
  confirm: ReturnType<typeof useConfirm>;
  router: ReturnType<typeof useRouter>;
}) {
  const { t } = useI18n();
  const runCritical = useCriticalAction();
  const [editing, setEditing] = useState<PriceRule | 'new' | null>(null);
  const [scopeType, setScopeType] = useState<PriceScopeType>('customer');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const cur = editing === 'new' ? null : editing;
  const visibleScopes = showAdvanced ? SCOPE_TYPES : PRIMARY_SCOPES;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget); // captured synchronously
    // New rule → create directly. Editing an existing rule is a PRICE CHANGE, so
    // it runs through the Critical Action standard (confirm + reason + audit).
    if (!cur) {
      startTransition(async () => {
        const res = await upsertPriceRule(fd);
        if (!res.ok) { toast.error(res.error ?? t('pricing.toastError')); return; }
        toast.success(t('pricing.toastSaved')); setEditing(null); router.refresh();
      });
      return;
    }
    void runCritical({
      action: t('pricing.criticalAction'),
      record: productName(cur.product_id),
      requireReason: true,
      execute: async (reason) => {
        if (reason) fd.set('reason', reason);
        const res = await upsertPriceRule(fd);
        return { ok: res.ok, error: res.error };
      },
      onDone: () => { setEditing(null); router.refresh(); },
    });
  }
  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? t('pricing.toastError')); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {editing === null && (
        <Button onClick={() => { setEditing('new'); setScopeType('customer'); setShowAdvanced(false); }}>
          <Plus className="h-4 w-4" /> {t('pricing.btnNewRule')}
        </Button>
      )}
      {editing !== null && (
        <Card><CardContent className="pt-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-semibold">{t('pricing.rulesTitle')}</h3>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={showAdvanced} onChange={(e) => { setShowAdvanced(e.target.checked); if (!e.target.checked) setScopeType('customer'); }} />
                {t('pricing.showAdvanced')}
              </label>
              <button onClick={() => setEditing(null)} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cur && <input type="hidden" name="id" value={cur.id} />}
            <Field label={t('pricing.fieldProduct')}>
              <select name="product_id" defaultValue={cur?.product_id ?? ''} className={inputCls} required>
                <option value="">{t('pricing.optionChoose')}</option>
                {products.map((p) => <option key={p.id} value={p.id}>{productName(p.id)}</option>)}
              </select>
            </Field>
            <Field label={t('pricing.fieldScopeType')}>
              <select name="scope_type" value={scopeType} onChange={(e) => setScopeType(e.target.value as PriceScopeType)} className={inputCls}>
                {visibleScopes.map((s) => <option key={s} value={s}>{t(`pricing.scope_${s}` as 'pricing.scope_global')}</option>)}
              </select>
            </Field>
            <Field label={t('pricing.fieldScope')}>
              <select name="scope_id" defaultValue={cur?.scope_id ?? ''} className={inputCls} disabled={scopeType === 'global'}>
                <option value="">{scopeType === 'global' ? '—' : t('pricing.optionChoose')}</option>
                {scopeOptions(scopeType).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
            <Field label={t('pricing.fieldPriceType')}>
              <select name="price_type" defaultValue={cur?.price_type ?? 'fixed'} className={inputCls}>
                {(['fixed', 'percent_off', 'amount_off'] as const).map((p) => <option key={p} value={p}>{t(`pricing.pt_${p}` as 'pricing.pt_fixed')}</option>)}
              </select>
            </Field>
            <Field label={t('pricing.fieldValue')}><Input name="value" type="number" step="0.0001" dir="ltr" defaultValue={cur?.value ?? ''} /></Field>
            <Field label={t('pricing.fieldMinQty')}><Input name="min_qty" type="number" step="0.001" dir="ltr" defaultValue={cur?.min_qty ?? 1} /></Field>
            <Field label={t('pricing.fieldPriority')}><Input name="priority" type="number" dir="ltr" defaultValue={cur?.priority ?? 0} /></Field>
            <Field label={t('pricing.fieldValidFrom')}><Input name="valid_from" type="date" dir="ltr" defaultValue={cur?.valid_from ?? ''} /></Field>
            <Field label={t('pricing.fieldValidTo')}><Input name="valid_to" type="date" dir="ltr" defaultValue={cur?.valid_to ?? ''} /></Field>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('pricing.btnSave')}</Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t('pricing.btnCancel')}</Button>
            </div>
          </form>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {rules.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('pricing.emptyRules')}</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
              <th className="p-3 text-start font-medium">{t('pricing.colProduct')}</th>
              <th className="p-3 text-start font-medium">{t('pricing.colScope')}</th>
              <th className="p-3 text-start font-medium">{t('pricing.colPrice')}</th>
              <th className="p-3 text-center font-medium">{t('pricing.colEffective')}</th>
              <th className="p-3 text-center font-medium">{t('pricing.colStatus')}</th>
              <th className="p-3"></th>
            </tr></thead>
            <tbody>{rules.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-secondary/30">
                <td className="p-3">{productName(r.product_id)}</td>
                <td className="p-3 text-muted-foreground">{t(`pricing.scope_${r.scope_type}` as 'pricing.scope_global')}: {scopeName(r.scope_type, r.scope_id)}</td>
                <td className="p-3 tabular-nums" dir="ltr">{t(`pricing.pt_${r.price_type}` as 'pricing.pt_fixed')} {r.value}{r.min_qty > 1 ? ` · ≥${r.min_qty}` : ''}</td>
                <td className="p-3 text-center text-xs text-muted-foreground" dir="ltr">{r.valid_from ?? '…'} → {r.valid_to ?? '…'}</td>
                <td className="p-3 text-center">{r.is_active ? <Badge variant="success">{t('pricing.active')}</Badge> : <Badge variant="secondary">{t('pricing.inactive')}</Badge>}</td>
                <td className="p-3"><div className="flex justify-end gap-1">
                  <button onClick={() => { setScopeType(r.scope_type); setShowAdvanced(ADVANCED_SCOPES.includes(r.scope_type)); setEditing(r); }} className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('pricing.btnEdit')}><Pencil className="h-4 w-4" /></button>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => togglePriceRuleActive(r.id, !r.is_active))}><Power className="h-3.5 w-3.5" /></Button>
                  <button onClick={async () => { if (await confirm({ title: t('pricing.confirmDelete') })) act(() => deletePriceRule(r.id)); }} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10" aria-label={t('pricing.btnDelete')}><Trash2 className="h-4 w-4" /></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </CardContent></Card>
    </div>
  );
}

function ListsSection({
  lists, items, products, branches, pending, startTransition, productName, nm, router,
}: {
  lists: PriceList[]; items: PriceListItem[]; products: Product[]; branches: Branch[];
  pending: boolean; startTransition: React.TransitionStartFunction;
  productName: (id: string | null) => string;
  nm: (x: { name: string; name_ar?: string | null }) => string;
  router: ReturnType<typeof useRouter>;
}) {
  const { t } = useI18n();
  const [sel, setSel] = useState<string>(lists[0]?.id ?? '');
  const listItems = useMemo(() => items.filter((i) => i.price_list_id === sel), [items, sel]);

  function submit(e: React.FormEvent<HTMLFormElement>, fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await fn(fd);
      if (!res.ok) { toast.error(res.error ?? t('pricing.toastError')); return; }
      toast.success(t('pricing.toastSaved')); form.reset(); router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardContent className="space-y-4 pt-6">
        <h3 className="font-semibold">{t('pricing.listsTitle')}</h3>
        {lists.length > 0 ? (
          <div className="divide-y rounded-md border">
            {lists.map((l) => (
              <button key={l.id} onClick={() => setSel(l.id)} className={`flex w-full items-center justify-between p-3 text-start text-sm ${sel === l.id ? 'bg-secondary' : ''}`}>
                <span className="font-medium">{nm(l)}{l.is_default && <Badge variant="secondary" className="ms-2">{t('pricing.default')}</Badge>}</span>
                <span className="text-xs text-muted-foreground">{l.branch_id ? branches.find((b) => b.id === l.branch_id)?.name ?? '' : t('pricing.optionGlobalBranch')}</span>
              </button>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">{t('pricing.emptyLists')}</p>}
        <form onSubmit={(e) => submit(e, upsertPriceList)} className="grid gap-2 sm:grid-cols-2">
          <Input name="name" placeholder={t('pricing.fieldListName')} required />
          <Input name="name_ar" placeholder={t('pricing.fieldListNameAr')} />
          <select name="branch_id" className={inputCls} defaultValue="">
            <option value="">{t('pricing.optionGlobalBranch')}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{nm(b)}</option>)}
          </select>
          <Button type="submit" size="sm" disabled={pending}><Plus className="h-4 w-4" /> {t('pricing.btnNewList')}</Button>
        </form>
      </CardContent></Card>

      <Card><CardContent className="space-y-4 pt-6">
        <h3 className="font-semibold">{t('pricing.listItemsTitle')}</h3>
        {!sel ? <p className="text-sm text-muted-foreground">{t('pricing.selectListHint')}</p> : (
          <>
            {listItems.length > 0 ? (
              <div className="divide-y rounded-md border">
                {listItems.map((i) => (
                  <div key={i.id} className="flex items-center justify-between p-3 text-sm">
                    <span>{productName(i.product_id)}</span>
                    <span className="tabular-nums" dir="ltr">{i.unit_price}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">{t('pricing.emptyItems')}</p>}
            <form onSubmit={(e) => submit(e, upsertPriceListItem)} className="grid gap-2 sm:grid-cols-3">
              <input type="hidden" name="price_list_id" value={sel} />
              <select name="product_id" className={`${inputCls} sm:col-span-2`} required defaultValue="">
                <option value="">{t('pricing.optionChoose')}</option>
                {products.map((p) => <option key={p.id} value={p.id}>{productName(p.id)}</option>)}
              </select>
              <Input name="unit_price" type="number" step="0.01" dir="ltr" placeholder={t('pricing.fieldUnitPrice')} required />
              <Button type="submit" size="sm" disabled={pending} className="sm:col-span-3"><Plus className="h-4 w-4" /> {t('pricing.btnAddItem')}</Button>
            </form>
          </>
        )}
      </CardContent></Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
