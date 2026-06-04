'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Tag, CreditCard, Receipt, Save, Layers, ChevronDown, AlertTriangle, Clock, XCircle,
  TimerReset, CheckCircle2, Search, SearchX, Loader2, Check, type LucideIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { useI18n } from '@/lib/i18n/provider';
import { buildQuery } from '@/lib/list-params';
import {
  BILLING_CURRENCIES, BILLING_INTERVALS, INTERVAL_LABELS, SUBSCRIPTION_STATUSES, STATUS_LABELS,
  formatMoney, toMajor, decimalsFor, type SubscriptionStatus,
} from '@/lib/erp/billing';
import { setPlanPrice, subscribeCompany, setSubscriptionStatus, issueInvoice } from './actions';

export interface PlanRow { key: string; name_en: string | null; name_ar: string | null; trial_days: number; is_active: boolean }
export interface PriceRow { plan_key: string; currency: string; interval: string; amount_minor: number; is_active: boolean }
export interface SubRow {
  companyId: string; company: string; planKey: string; currency: string; interval: string;
  status: string; trialEnd: string | null; periodEnd: string | null;
}
export interface InvoiceRow {
  id: string; company: string; number: string; currency: string; totalMinor: number; taxMinor: number; status: string; issuedAt: string;
}
export interface AttentionSummary {
  unpaidCount: number;
  unpaidByCurrency: Record<string, number>;
  expiringCount: number;
  expiredCount: number;
  trialsCount: number;
}
export interface SubFilters { q: string; status: string }
export interface InvFilters { q: string; status: string; date: string }

/** Base/primary currency for the default per-plan price view (multi-currency
 *  matrix relocated to the Advanced expander). */
const BASE_CURRENCY = 'SAR';

const statusVariant = (s: string): 'success' | 'warning' | 'destructive' | 'secondary' =>
  s === 'active' ? 'success' : s === 'trial' ? 'warning' : s === 'expired' || s === 'suspended' || s === 'cancelled' ? 'destructive' : 'secondary';

const invStatusVariant = (s: string): 'success' | 'warning' | 'destructive' | 'secondary' =>
  s === 'paid' ? 'success' : s === 'issued' ? 'warning' : s === 'void' ? 'destructive' : 'secondary';

/** Premium section header: cyan-tinted icon chip + title + optional hint. */
function SectionHeader({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

type Tone = 'destructive' | 'warning' | 'info';
const TONE_CLS: Record<Tone, string> = {
  destructive: 'border-s-destructive bg-destructive/5 text-destructive',
  warning: 'border-s-warning bg-warning/5 text-warning',
  info: 'border-s-info bg-info/5 text-info',
};

/** A single tap-to-filter attention chip (severity-toned). */
function AttentionTile({
  icon: Icon, tone, label, value, onClick,
}: { icon: LucideIcon; tone: Tone; label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg border border-s-4 p-3 text-start transition-colors hover:brightness-95 ${TONE_CLS[tone]}`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight">{label}</p>
        <p className="truncate text-xs opacity-80" dir="ltr">{value}</p>
      </div>
    </button>
  );
}

export function BillingAdmin({
  plans, prices, companies,
  attention, subscriptions, subTotal, subPage, subFilters,
  invoices, invTotal, invPage, invFilters, pageSize,
}: {
  plans: PlanRow[]; prices: PriceRow[]; companies: { id: string; name: string }[];
  attention: AttentionSummary;
  subscriptions: SubRow[]; subTotal: number; subPage: number; subFilters: SubFilters;
  invoices: InvoiceRow[]; invTotal: number; invPage: number; invFilters: InvFilters;
  pageSize: number;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [navPending, startNav] = useTransition();

  const planName = (p: PlanRow) => (locale === 'ar' ? p.name_ar : p.name_en) || p.name_ar || p.name_en || p.key;
  const planLabelByKey = (key: string) => {
    const p = plans.find((x) => x.key === key);
    return p ? planName(p) : key;
  };

  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of prices) m.set(`${p.plan_key}|${p.currency}|${p.interval}`, p.amount_minor);
    return m;
  }, [prices]);

  // local editable price inputs keyed plan|currency|interval (major units)
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const priceValue = (plan: string, cur: string, intv: string) => {
    const k = `${plan}|${cur}|${intv}`;
    if (draft[k] !== undefined) return draft[k];
    const minor = priceMap.get(k);
    return minor != null ? String(toMajor(minor, cur)) : '';
  };

  /** Validate a major-unit string against the currency's decimal precision. */
  function priceError(raw: string, cur: string): string | null {
    if (raw.trim() === '') return null; // empty = leave unset, not an error
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return t('billing.priceBook.invalidAmount');
    const decimals = decimalsFor(cur);
    const parts = raw.split('.');
    if (parts[1] && parts[1].length > decimals) return t('billing.priceBook.invalidAmount');
    return null;
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string): Promise<boolean> {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) { toast.error(r.error ?? t('billing.toast.error')); return false; }
      toast.success(ok);
      return true;
    } catch {
      toast.error(t('billing.toast.error'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Save one price; on success flash a per-cell checkmark (no silent save). */
  async function savePrice(plan: string, cur: string, intv: string) {
    const k = `${plan}|${cur}|${intv}`;
    const raw = priceValue(plan, cur, intv);
    if (priceError(raw, cur)) { toast.error(t('billing.priceBook.invalidAmount')); return; }
    const ok = await run(() => setPlanPrice(plan, cur, intv, parseFloat(raw || '0')), t('billing.priceBook.saved'));
    if (ok) {
      setSavedKeys((s) => new Set(s).add(k));
      window.setTimeout(() => setSavedKeys((s) => { const n = new Set(s); n.delete(k); return n; }), 2000);
    }
  }

  /** Apply the base-currency / current value across every currency × interval. */
  async function bulkApply(plan: string, fromCur: string, fromIntv: string) {
    const raw = priceValue(plan, fromCur, fromIntv);
    if (priceError(raw, fromCur)) { toast.error(t('billing.priceBook.invalidAmount')); return; }
    const amount = parseFloat(raw || '0');
    setBusy(true);
    try {
      for (const c of BILLING_CURRENCIES) {
        for (const iv of BILLING_INTERVALS) {
          const r = await setPlanPrice(plan, c.code, iv, amount);
          if (!r.ok) { toast.error(r.error ?? t('billing.toast.error')); return; }
        }
      }
      toast.success(t('billing.priceBook.bulkApplied'));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // ── URL-driven list controls (namespaced, server-paginated) ───────────────
  function pushParams(next: Record<string, string | number | undefined>) {
    const current: Record<string, string | undefined> = {};
    searchParams.forEach((v, key) => { current[key] = v; });
    const merged = { ...current, ...next };
    // normalise defaults out of the URL
    const clean: Record<string, string | number | undefined> = {};
    for (const [key, v] of Object.entries(merged)) {
      if (v === undefined || v === '' || v === 'all') continue;
      if ((key === 'sub_page' || key === 'inv_page') && Number(v) <= 1) continue;
      clean[key] = v;
    }
    startNav(() => router.push(`${pathname}${buildQuery(clean)}`));
  }

  // ── Subscriptions search (debounced) ──
  const [subSearch, setSubSearch] = useState(subFilters.q);
  useEffect(() => setSubSearch(subFilters.q), [subFilters.q]);
  useEffect(() => {
    if (subSearch === subFilters.q) return;
    const id = window.setTimeout(() => pushParams({ sub_q: subSearch || undefined, sub_page: 1 }), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subSearch]);

  // ── Invoices search (debounced) ──
  const [invSearch, setInvSearch] = useState(invFilters.q);
  useEffect(() => setInvSearch(invFilters.q), [invFilters.q]);
  useEffect(() => {
    if (invSearch === invFilters.q) return;
    const id = window.setTimeout(() => pushParams({ inv_q: invSearch || undefined, inv_page: 1 }), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invSearch]);

  // ── Subscribe flow (the single primary action) ────────────────────────────
  const [showSubscribe, setShowSubscribe] = useState(false);
  const subscribeRef = useRef<HTMLDivElement>(null);
  const [companyQuery, setCompanyQuery] = useState('');
  const [subCompany, setSubCompany] = useState('');
  const [subCompanyName, setSubCompanyName] = useState('');
  const [subPlan, setSubPlan] = useState(plans[0]?.key ?? '');
  const [subCurrency, setSubCurrency] = useState<string>(BASE_CURRENCY);
  const [subInterval, setSubInterval] = useState<string>('monthly');
  const [subTrial, setSubTrial] = useState('0');

  const companyMatches = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return [];
    return companies.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [companyQuery, companies]);

  function openSubscribe() {
    setShowSubscribe(true);
    window.setTimeout(() => subscribeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  const unpaidValue = Object.entries(attention.unpaidByCurrency)
    .map(([cur, minor]) => formatMoney(minor, cur))
    .join(' · ');

  const hasAttention =
    attention.unpaidCount > 0 || attention.expiringCount > 0 || attention.expiredCount > 0 || attention.trialsCount > 0;

  const newSubscriptionBtn = (
    <Button onClick={openSubscribe} className="w-full sm:w-auto">
      <CreditCard className="h-4 w-4" /> {t('billing.primary.newSubscription')}
    </Button>
  );

  return (
    <div className="space-y-6">
      {/* ── T1: Billing attention ───────────────────────────────────────── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <SectionHeader icon={AlertTriangle} title={t('billing.attention.title')} />
            <div className="sm:shrink-0">{newSubscriptionBtn}</div>
          </div>
          {hasAttention ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {attention.unpaidCount > 0 && (
                <AttentionTile
                  icon={Receipt} tone="destructive"
                  label={t('billing.attention.unpaid')}
                  value={t('billing.attention.unpaidValue', { count: attention.unpaidCount, amount: unpaidValue || '—' })}
                  onClick={() => pushParams({ inv_status: 'issued', inv_q: undefined, inv_date: undefined, inv_page: 1 })}
                />
              )}
              {attention.expiredCount > 0 && (
                <AttentionTile
                  icon={XCircle} tone="destructive"
                  label={t('billing.attention.expired')}
                  value={t('billing.attention.expiredValue', { count: attention.expiredCount })}
                  onClick={() => pushParams({ sub_status: 'expired', sub_q: undefined, sub_page: 1 })}
                />
              )}
              {attention.expiringCount > 0 && (
                <AttentionTile
                  icon={Clock} tone="warning"
                  label={t('billing.attention.expiring')}
                  value={t('billing.attention.expiringValue', { count: attention.expiringCount })}
                  onClick={() => pushParams({ sub_status: 'active', sub_q: undefined, sub_page: 1 })}
                />
              )}
              {attention.trialsCount > 0 && (
                <AttentionTile
                  icon={TimerReset} tone="info"
                  label={t('billing.attention.trials')}
                  value={t('billing.attention.trialsValue', { count: attention.trialsCount })}
                  onClick={() => pushParams({ sub_status: 'trial', sub_q: undefined, sub_page: 1 })}
                />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> {t('billing.attention.allClear')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Subscribe flow (primary action target) ──────────────────────── */}
      {showSubscribe && (
        <Card ref={subscribeRef}>
          <CardContent className="p-6 space-y-4">
            <SectionHeader icon={CreditCard} title={t('billing.subscribe.title')} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {/* searchable company picker (typeahead) */}
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
                <Label htmlFor="sub-company">{t('billing.subscriptions.company')}</Label>
                {subCompany ? (
                  <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm">
                    <span className="truncate">{subCompanyName}</span>
                    <button
                      type="button" className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => { setSubCompany(''); setSubCompanyName(''); setCompanyQuery(''); }}
                    >
                      {t('billing.subscribe.cancel')}
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="sub-company" className="ps-9" value={companyQuery}
                      onChange={(e) => setCompanyQuery(e.target.value)}
                      placeholder={t('billing.subscribe.searchCompany')}
                    />
                    {companyQuery.trim() && (
                      <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover shadow-md">
                        {companyMatches.length === 0 ? (
                          <p className="px-3 py-2 text-sm text-muted-foreground">{t('billing.subscribe.noCompany')}</p>
                        ) : (
                          companyMatches.map((c) => (
                            <button
                              key={c.id} type="button"
                              className="block w-full px-3 py-2 text-start text-sm hover:bg-secondary"
                              onClick={() => { setSubCompany(c.id); setSubCompanyName(c.name); setCompanyQuery(''); }}
                            >
                              {c.name}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sub-plan">{t('billing.subscriptions.plan')}</Label>
                <Select id="sub-plan" value={subPlan} onChange={(e) => setSubPlan(e.target.value)}>
                  {plans.map((p) => <option key={p.key} value={p.key}>{planName(p)}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sub-currency">{t('billing.priceBook.currency')}</Label>
                <Select id="sub-currency" value={subCurrency} onChange={(e) => setSubCurrency(e.target.value)}>
                  {BILLING_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sub-interval">{INTERVAL_LABELS.monthly[locale]} / {INTERVAL_LABELS.yearly[locale]}</Label>
                <Select id="sub-interval" value={subInterval} onChange={(e) => setSubInterval(e.target.value)}>
                  {BILLING_INTERVALS.map((iv) => <option key={iv} value={iv}>{INTERVAL_LABELS[iv][locale]}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sub-trial">{t('billing.subscribe.trialDays')}</Label>
                <Input id="sub-trial" className="tabular-nums" dir="ltr" type="number" min={0} value={subTrial}
                  onChange={(e) => setSubTrial(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="w-full sm:w-auto" disabled={busy || !subCompany || !subPlan}
                onClick={async () => {
                  const ok = await run(() => subscribeCompany(subCompany, subPlan, subCurrency, subInterval, parseInt(subTrial || '0', 10)), t('billing.toast.subscribed'));
                  if (ok) { setShowSubscribe(false); setSubCompany(''); setSubCompanyName(''); router.refresh(); }
                }}>
                <CreditCard className="h-4 w-4" /> {t('billing.subscribe.submit')}
              </Button>
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setShowSubscribe(false)}>
                {t('billing.subscribe.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── T2: Subscriptions ───────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <SectionHeader icon={Layers} title={t('billing.subscriptions.title')} />

          {/* status legend */}
          <details className="rounded-lg border bg-secondary/20 text-sm">
            <summary className="cursor-pointer select-none px-3 py-2 font-medium">{t('billing.subscriptions.legendTitle')}</summary>
            <ul className="space-y-1 px-3 pb-3 text-xs text-muted-foreground">
              {SUBSCRIPTION_STATUSES.map((st) => (
                <li key={st} className="flex items-center gap-2">
                  <Badge variant={statusVariant(st)}>{STATUS_LABELS[st][locale]}</Badge>
                  <span>{t(`billing.subscriptions.legend.${st}`)}</span>
                </li>
              ))}
            </ul>
          </details>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input type="search" className="ps-9" value={subSearch} onChange={(e) => setSubSearch(e.target.value)}
                placeholder={t('billing.subscriptions.searchPlaceholder')} />
            </div>
            <Select aria-label={t('billing.subscriptions.status')} value={subFilters.status} className="sm:w-44"
              onChange={(e) => pushParams({ sub_status: e.target.value, sub_page: 1 })}>
              <option value="all">{t('billing.subscriptions.filterAllStatuses')}</option>
              {SUBSCRIPTION_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABELS[st][locale]}</option>)}
            </Select>
          </div>

          {subscriptions.length === 0 ? (
            <EmptyState icon={<Layers />} className="border-0"
              title={subFilters.q || subFilters.status !== 'all' ? t('billing.subscriptions.noResults') : t('billing.subscriptions.empty')} />
          ) : (
            <div className={`overflow-x-auto rounded-lg border ${navPending ? 'opacity-60 transition-opacity' : ''}`}>
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t('billing.subscriptions.company')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('billing.subscriptions.plan')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('billing.subscriptions.status')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('billing.subscriptions.renews')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('billing.subscriptions.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((s) => (
                    <tr key={s.companyId} className="border-t transition-colors hover:bg-secondary/30">
                      <td className="px-3 py-2">{s.company}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {planLabelByKey(s.planKey)} · {s.currency} · {INTERVAL_LABELS[s.interval as 'monthly' | 'yearly']?.[locale] ?? s.interval}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={statusVariant(s.status)}>
                          {STATUS_LABELS[s.status as SubscriptionStatus]?.[locale] ?? s.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground" dir="ltr">{s.status === 'trial' ? s.trialEnd : s.periodEnd}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <select
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                            value={s.status} disabled={busy}
                            onChange={(e) => run(() => setSubscriptionStatus(s.companyId, e.target.value), t('billing.toast.statusSet')).then((ok) => ok && router.refresh())}
                          >
                            {SUBSCRIPTION_STATUSES.map((st) => (
                              <option key={st} value={st}>{STATUS_LABELS[st][locale]}</option>
                            ))}
                          </select>
                          <Button size="sm" variant="outline" disabled={busy}
                            onClick={() => run(() => issueInvoice(s.companyId), t('billing.toast.invoiceIssued')).then((ok) => ok && router.refresh())}>
                            <Receipt className="h-3.5 w-3.5" /> {t('billing.subscriptions.issueInvoice')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={subPage} pageSize={pageSize} total={subTotal} disabled={navPending}
            onPageChange={(p) => pushParams({ sub_page: p })} />
        </CardContent>
      </Card>

      {/* ── T2: Invoices ────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <SectionHeader icon={Receipt} title={t('billing.invoices.title')} />

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input type="search" className="ps-9" value={invSearch} onChange={(e) => setInvSearch(e.target.value)}
                placeholder={t('billing.invoices.searchPlaceholder')} />
            </div>
            <Select aria-label={t('billing.invoices.status')} value={invFilters.status} className="sm:w-40"
              onChange={(e) => pushParams({ inv_status: e.target.value, inv_page: 1 })}>
              <option value="all">{t('billing.invoices.filterAllStatuses')}</option>
              <option value="draft">{t('billing.invoices.statusDraft')}</option>
              <option value="issued">{t('billing.invoices.statusIssued')}</option>
              <option value="paid">{t('billing.invoices.statusPaid')}</option>
              <option value="void">{t('billing.invoices.statusVoid')}</option>
            </Select>
            <Select aria-label={t('billing.invoices.date')} value={invFilters.date} className="sm:w-40"
              onChange={(e) => pushParams({ inv_date: e.target.value, inv_page: 1 })}>
              <option value="all">{t('billing.invoices.filterAllDates')}</option>
              <option value="30">{t('billing.invoices.date30')}</option>
              <option value="90">{t('billing.invoices.date90')}</option>
              <option value="year">{t('billing.invoices.dateYear')}</option>
            </Select>
          </div>

          {invoices.length === 0 ? (
            <EmptyState icon={<SearchX />} className="border-0"
              title={invFilters.q || invFilters.status !== 'all' || invFilters.date !== 'all' ? t('billing.invoices.noResults') : t('billing.invoices.empty')} />
          ) : (
            <div className={`overflow-x-auto rounded-lg border ${navPending ? 'opacity-60 transition-opacity' : ''}`}>
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t('billing.invoices.number')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('billing.invoices.company')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('billing.invoices.tax')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('billing.invoices.total')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('billing.invoices.status')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('billing.invoices.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id} className="border-t transition-colors hover:bg-secondary/30">
                      <td className="px-3 py-2 whitespace-nowrap" dir="ltr">{i.number}</td>
                      <td className="px-3 py-2">{i.company}</td>
                      <td className="px-3 py-2 text-end whitespace-nowrap tabular-nums">{formatMoney(i.taxMinor, i.currency)}</td>
                      <td className="px-3 py-2 text-end whitespace-nowrap font-medium tabular-nums">{formatMoney(i.totalMinor, i.currency)}</td>
                      <td className="px-3 py-2"><Badge variant={invStatusVariant(i.status)}>{t(`billing.invoices.status${i.status.charAt(0).toUpperCase()}${i.status.slice(1)}`)}</Badge></td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground" dir="ltr">{new Date(i.issuedAt).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={invPage} pageSize={pageSize} total={invTotal} disabled={navPending}
            onPageChange={(p) => pushParams({ inv_page: p })} />
        </CardContent>
      </Card>

      {/* ── T3/T4: Price book — base price + Advanced matrix ─────────────── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <SectionHeader icon={Tag} title={t('billing.priceBook.title')} hint={t('billing.priceBook.hint')} />
          <div className="space-y-5">
            {plans.filter((p) => p.is_active).map((p) => {
              const baseErr = priceError(priceValue(p.key, BASE_CURRENCY, 'monthly'), BASE_CURRENCY);
              const baseKey = `${p.key}|${BASE_CURRENCY}|monthly`;
              return (
                <div key={p.key} className="rounded-lg border p-4">
                  <div className="mb-3 font-medium">{planName(p)} <span className="text-xs text-muted-foreground">({p.key})</span></div>

                  {/* Default: base currency, monthly */}
                  <div className="space-y-1.5">
                    <Label htmlFor={`price-${p.key}`}>{t('billing.priceBook.baseCurrency', { currency: BASE_CURRENCY })}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`price-${p.key}`} className="h-9 w-40 tabular-nums" dir="ltr" type="number" min={0}
                        step={1 / 10 ** decimalsFor(BASE_CURRENCY)}
                        value={priceValue(p.key, BASE_CURRENCY, 'monthly')}
                        onChange={(e) => setDraft((d) => ({ ...d, [baseKey]: e.target.value }))}
                        aria-invalid={!!baseErr}
                      />
                      <Button size="sm" variant="outline" disabled={busy || !!baseErr}
                        onClick={() => savePrice(p.key, BASE_CURRENCY, 'monthly')}>
                        {savedKeys.has(baseKey) ? <Check className="h-3.5 w-3.5 text-success" /> : <Save className="h-3.5 w-3.5" />}
                        {t('billing.priceBook.save')}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('billing.priceBook.decimalsHint', { decimals: decimalsFor(BASE_CURRENCY) })}</p>
                    {baseErr && <p className="text-xs text-destructive">{baseErr}</p>}
                  </div>

                  {/* Advanced: full currency × interval matrix + bulk apply */}
                  <details className="group mt-4 rounded-md border bg-secondary/10">
                    <summary className="flex cursor-pointer select-none items-center gap-1 px-3 py-2 text-sm font-medium">
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                      {t('billing.priceBook.advanced')}
                    </summary>
                    <div className="space-y-3 p-3">
                      <Button size="sm" variant="secondary" disabled={busy}
                        onClick={() => bulkApply(p.key, BASE_CURRENCY, 'monthly')}>
                        <Layers className="h-3.5 w-3.5" /> {t('billing.priceBook.bulkApply')}
                      </Button>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[420px] text-sm">
                          <thead className="text-muted-foreground">
                            <tr>
                              <th className="px-2 py-1 text-start font-medium">{t('billing.priceBook.currency')}</th>
                              {BILLING_INTERVALS.map((iv) => (
                                <th key={iv} className="px-2 py-1 text-start font-medium">{INTERVAL_LABELS[iv][locale]}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {BILLING_CURRENCIES.map((c) => (
                              <tr key={c.code} className="border-t transition-colors hover:bg-secondary/30">
                                <td className="px-2 py-1.5 whitespace-nowrap">{c.code} <span className="text-xs text-muted-foreground">· {c.decimals}d</span></td>
                                {BILLING_INTERVALS.map((iv) => {
                                  const k = `${p.key}|${c.code}|${iv}`;
                                  const err = priceError(priceValue(p.key, c.code, iv), c.code);
                                  return (
                                    <td key={iv} className="px-2 py-1.5">
                                      <div className="flex items-center gap-1">
                                        <Input
                                          className="h-8 w-28 tabular-nums" dir="ltr" type="number" min={0}
                                          step={1 / 10 ** decimalsFor(c.code)}
                                          value={priceValue(p.key, c.code, iv)}
                                          onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                                          placeholder="—" aria-invalid={!!err}
                                        />
                                        <Button size="sm" variant="outline" disabled={busy || !!err}
                                          onClick={() => savePrice(p.key, c.code, iv)}>
                                          {savedKeys.has(k) ? <Check className="h-3.5 w-3.5 text-success" /> : <Save className="h-3.5 w-3.5" />}
                                        </Button>
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
