'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Tag, CreditCard, Receipt, Save, PlayCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
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

const statusVariant = (s: string): 'success' | 'warning' | 'destructive' | 'secondary' =>
  s === 'active' ? 'success' : s === 'trial' ? 'warning' : s === 'expired' || s === 'suspended' || s === 'cancelled' ? 'destructive' : 'secondary';

export function BillingAdmin({
  plans, prices, subscriptions, companies, invoices,
}: {
  plans: PlanRow[]; prices: PriceRow[]; subscriptions: SubRow[];
  companies: { id: string; name: string }[]; invoices: InvoiceRow[];
}) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);

  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of prices) m.set(`${p.plan_key}|${p.currency}|${p.interval}`, p.amount_minor);
    return m;
  }, [prices]);

  // local editable price inputs keyed plan|currency|interval (major units)
  const [draft, setDraft] = useState<Record<string, string>>({});
  const priceValue = (plan: string, cur: string, intv: string) => {
    const k = `${plan}|${cur}|${intv}`;
    if (draft[k] !== undefined) return draft[k];
    const minor = priceMap.get(k);
    return minor != null ? String(toMajor(minor, cur)) : '';
  };

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) return toast.error(r.error ?? t('billing.toast.error'));
      toast.success(ok);
    } catch {
      toast.error(t('billing.toast.error'));
    } finally {
      setBusy(false);
    }
  }

  const planName = (p: PlanRow) => (locale === 'ar' ? p.name_ar : p.name_en) || p.name_ar || p.name_en || p.key;
  const planLabelByKey = (key: string) => {
    const p = plans.find((x) => x.key === key);
    return p ? planName(p) : key;
  };

  // ── subscribe form state ──
  const [subCompany, setSubCompany] = useState(companies[0]?.id ?? '');
  const [subPlan, setSubPlan] = useState(plans[0]?.key ?? '');
  const [subCurrency, setSubCurrency] = useState<string>('SAR');
  const [subInterval, setSubInterval] = useState<string>('monthly');
  const [subTrial, setSubTrial] = useState('0');

  return (
    <div className="space-y-6">
      {/* Price book */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Tag className="h-4 w-4" /> {t('billing.priceBook.title')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('billing.priceBook.hint')}</p>
          <div className="space-y-5">
            {plans.filter((p) => p.is_active).map((p) => (
              <div key={p.key} className="rounded-lg border p-4">
                <div className="mb-3 font-medium">{planName(p)} <span className="text-xs text-muted-foreground">({p.key})</span></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
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
                        <tr key={c.code} className="border-t">
                          <td className="px-2 py-1.5 whitespace-nowrap">{c.code} <span className="text-xs text-muted-foreground">· {c.decimals}d</span></td>
                          {BILLING_INTERVALS.map((iv) => {
                            const k = `${p.key}|${c.code}|${iv}`;
                            return (
                              <td key={iv} className="px-2 py-1.5">
                                <div className="flex items-center gap-1">
                                  <Input
                                    className="h-8 w-28"
                                    type="number"
                                    min={0}
                                    step={1 / 10 ** decimalsFor(c.code)}
                                    value={priceValue(p.key, c.code, iv)}
                                    onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                                    placeholder="—"
                                  />
                                  <Button
                                    size="sm" variant="outline" disabled={busy}
                                    onClick={() => run(
                                      () => setPlanPrice(p.key, c.code, iv, parseFloat(priceValue(p.key, c.code, iv) || '0')),
                                      t('billing.toast.priceSaved'),
                                    )}
                                  >
                                    <Save className="h-3.5 w-3.5" />
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
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Assign / change a subscription */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CreditCard className="h-4 w-4" /> {t('billing.subscribe.title')}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <select className="h-10 rounded-md border border-input bg-background px-2 text-sm lg:col-span-2"
              value={subCompany} onChange={(e) => setSubCompany(e.target.value)}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              value={subPlan} onChange={(e) => setSubPlan(e.target.value)}>
              {plans.map((p) => <option key={p.key} value={p.key}>{planName(p)}</option>)}
            </select>
            <select className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              value={subCurrency} onChange={(e) => setSubCurrency(e.target.value)}>
              {BILLING_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
            <select className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              value={subInterval} onChange={(e) => setSubInterval(e.target.value)}>
              {BILLING_INTERVALS.map((iv) => <option key={iv} value={iv}>{INTERVAL_LABELS[iv][locale]}</option>)}
            </select>
            <Input className="h-10" type="number" min={0} value={subTrial}
              onChange={(e) => setSubTrial(e.target.value)} placeholder={t('billing.subscribe.trialDays')} />
          </div>
          <Button disabled={busy || !subCompany || !subPlan}
            onClick={() => run(() => subscribeCompany(subCompany, subPlan, subCurrency, subInterval, parseInt(subTrial || '0', 10)), t('billing.toast.subscribed'))}>
            <CreditCard className="h-4 w-4" /> {t('billing.subscribe.submit')}
          </Button>
        </CardContent>
      </Card>

      {/* Current subscriptions */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-base font-semibold">{t('billing.subscriptions.title')}</h2>
          {subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('billing.subscriptions.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
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
                    <tr key={s.companyId} className="border-t">
                      <td className="px-3 py-2">{s.company}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {planLabelByKey(s.planKey)} · {s.currency} · {INTERVAL_LABELS[s.interval as 'monthly' | 'yearly']?.[locale] ?? s.interval}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={statusVariant(s.status)}>
                          {STATUS_LABELS[s.status as SubscriptionStatus]?.[locale] ?? s.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{s.status === 'trial' ? s.trialEnd : s.periodEnd}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <select
                            className="h-8 rounded border border-input bg-background px-1 text-xs"
                            value={s.status} disabled={busy}
                            onChange={(e) => run(() => setSubscriptionStatus(s.companyId, e.target.value), t('billing.toast.statusSet'))}
                          >
                            {SUBSCRIPTION_STATUSES.map((st) => (
                              <option key={st} value={st}>{STATUS_LABELS[st][locale]}</option>
                            ))}
                          </select>
                          <Button size="sm" variant="outline" disabled={busy}
                            onClick={() => run(() => issueInvoice(s.companyId), t('billing.toast.invoiceIssued'))}>
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
        </CardContent>
      </Card>

      {/* Invoice history */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Receipt className="h-4 w-4" /> {t('billing.invoices.title')}
          </h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('billing.invoices.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
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
                    <tr key={i.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap" dir="ltr">{i.number}</td>
                      <td className="px-3 py-2">{i.company}</td>
                      <td className="px-3 py-2 text-end whitespace-nowrap">{formatMoney(i.taxMinor, i.currency)}</td>
                      <td className="px-3 py-2 text-end whitespace-nowrap font-medium">{formatMoney(i.totalMinor, i.currency)}</td>
                      <td className="px-3 py-2"><Badge variant={i.status === 'paid' ? 'success' : 'secondary'}>{i.status}</Badge></td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{new Date(i.issuedAt).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
