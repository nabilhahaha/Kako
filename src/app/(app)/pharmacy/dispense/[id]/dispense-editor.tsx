'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Plus, Minus, Trash2, Search, CheckCircle2, X, Printer, Loader2, AlertTriangle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/provider';
import { updateDispenseMeta, addDispenseItem, setItemQty, finalizeDispense, cancelDispense } from '../../actions';

export interface DispenseHeader { id: string; status: string; patient_name: string | null; patient_phone: string | null; doctor_name: string | null; rx_number: string | null; is_controlled: boolean; invoice_no: string | null; notes: string | null }
export interface DispenseItem { id: string; name: string; qty: number; price: number; batch_number: string | null; expiry_date: string | null }
export interface ProductOption { id: string; name: string; price: number }

type TFunc = (key: string, params?: Record<string, string | number>) => string;

function expiryInfo(date: string | null, t: TFunc, intlLocale: string): { label: string; tone: 'ok' | 'warn' | 'bad' } | null {
  if (!date) return null;
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: t('pharmacy.expiryExpired', { date: formatDate(date, intlLocale) }), tone: 'bad' };
  if (days <= 90) return { label: t('pharmacy.expiryWarn', { date: formatDate(date, intlLocale), days }), tone: 'warn' };
  return { label: t('pharmacy.expiryOk', { date: formatDate(date, intlLocale) }), tone: 'ok' };
}

export function DispenseEditor({ dispense, items, products }: { dispense: DispenseHeader; items: DispenseItem[]; products: ProductOption[] }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState('');
  const closed = dispense.status !== 'open';

  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return products.filter((p) => p.name.toLowerCase().includes(s)).slice(0, 12);
  }, [products, q]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    startTransition(async () => { const res = await fn(); if (!res.ok) { toast.error(res.error ?? t('pharmacy.errGeneric')); return; } if (ok) toast.success(ok); router.refresh(); });
  }
  function saveMeta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set('id', dispense.id);
    run(() => updateDispenseMeta(fd), t('pharmacy.toastMetaSaved'));
  }
  function finalize() {
    startTransition(async () => { const res = await finalizeDispense(dispense.id); if (!res.ok) { toast.error(res.error ?? t('pharmacy.errGeneric')); return; } toast.success(t('pharmacy.toastDispensed')); router.push('/pharmacy/dispense'); });
  }
  function cancel() {
    startTransition(async () => { const res = await cancelDispense(dispense.id); if (!res.ok) { toast.error(res.error ?? t('pharmacy.errGeneric')); return; } toast.success(t('pharmacy.toastCancelled')); router.push('/pharmacy/dispense'); });
  }

  return (
    <div>
      <Link href="/pharmacy/dispense" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" /> {t('pharmacy.backToList')}</Link>
      <div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-bold">{t('pharmacy.editorTitle')}</h1>{closed && <Badge variant={dispense.status === 'cancelled' ? 'destructive' : 'success'}>{dispense.status === 'cancelled' ? t('pharmacy.badgeCancelled') : t('pharmacy.badgeDone')}</Badge>}</div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Header / prescription */}
        <div className="lg:col-span-2">
          <Card><CardContent className="pt-6">
            <form onSubmit={saveMeta} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>{t('pharmacy.labelPatient')}</Label><Input name="patient_name" defaultValue={dispense.patient_name ?? ''} disabled={closed} /></div>
                <div className="space-y-1"><Label>{t('pharmacy.labelPhone')}</Label><Input name="patient_phone" dir="ltr" defaultValue={dispense.patient_phone ?? ''} disabled={closed} /></div>
                <div className="space-y-1"><Label>{t('pharmacy.labelDoctor')}</Label><Input name="doctor_name" defaultValue={dispense.doctor_name ?? ''} disabled={closed} /></div>
                <div className="space-y-1"><Label>{t('pharmacy.labelRxNumber')}</Label><Input name="rx_number" dir="ltr" defaultValue={dispense.rx_number ?? ''} disabled={closed} /></div>
                <div className="space-y-1"><Label>{t('pharmacy.labelInvoiceNo')}</Label><Input name="invoice_no" dir="ltr" defaultValue={dispense.invoice_no ?? ''} disabled={closed} /></div>
                <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_controlled" defaultChecked={dispense.is_controlled} disabled={closed} className="h-4 w-4" /> {t('pharmacy.labelControlled')}</label></div>
              </div>
              <div className="space-y-1"><Label>{t('pharmacy.labelNotes')}</Label><Input name="notes" defaultValue={dispense.notes ?? ''} disabled={closed} /></div>
              {!closed && <Button type="submit" variant="outline" disabled={pending}>{t('pharmacy.btnSaveMeta')}</Button>}
            </form>
          </CardContent></Card>
        </div>

        {/* Items + product search */}
        <div className="lg:col-span-3 space-y-4">
          {!closed && (
            <Card><CardContent className="pt-6">
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pharmacy.searchDrugPlaceholder')} className="ps-9" />
              </div>
              {found.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {found.map((p) => (
                    <button key={p.id} disabled={pending} onClick={() => { run(() => addDispenseItem(dispense.id, p.id)); setQ(''); }}
                      className="flex flex-col items-center gap-1 rounded-lg border bg-card p-2 text-center text-sm hover:border-primary/50 hover:bg-secondary disabled:opacity-50">
                      <span className="font-medium leading-tight">{p.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">{formatCurrency(p.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent></Card>
          )}

          <Card><CardContent className="p-0">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t('pharmacy.emptyItems')}</p>
            ) : (
              <ul className="divide-y">
                {items.map((it) => {
                  const ex = expiryInfo(it.expiry_date, t, INTL_LOCALE[locale]);
                  return (
                    <li key={it.id} className="space-y-1 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{it.name}</span>
                        <div className="flex items-center gap-2">
                          {!closed ? (
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="outline" className="h-6 w-6" disabled={pending} onClick={() => run(() => setItemQty(it.id, it.qty - 1, dispense.id))}>{it.qty <= 1 ? <Trash2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}</Button>
                              <span className="w-6 text-center tabular-nums">{it.qty}</span>
                              <Button size="icon" variant="outline" className="h-6 w-6" disabled={pending} onClick={() => run(() => setItemQty(it.id, it.qty + 1, dispense.id))}><Plus className="h-3 w-3" /></Button>
                            </div>
                          ) : <span className="text-sm text-muted-foreground">× {it.qty}</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {it.batch_number && <span className="text-muted-foreground" dir="ltr">{t('pharmacy.batchLabel', { number: it.batch_number })}</span>}
                        {ex && (
                          <span className={`inline-flex items-center gap-1 ${ex.tone === 'bad' ? 'text-destructive' : ex.tone === 'warn' ? 'text-warning' : 'text-muted-foreground'}`}>
                            {ex.tone !== 'ok' && <AlertTriangle className="h-3 w-3" />}{ex.label}
                          </span>
                        )}
                        {!it.batch_number && !ex && <span className="text-muted-foreground">{t('pharmacy.noBatch')}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent></Card>

          <div className="flex flex-wrap gap-2">
            {!closed ? (
              <>
                <Button disabled={pending || items.length === 0} onClick={finalize}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {t('pharmacy.btnFinalize')}</Button>
                <Link href={`/print/pharmacy/dispense/${dispense.id}`} target="_blank" className={buttonVariants({ variant: 'outline' })}><Printer className="h-4 w-4" /> {t('pharmacy.btnPrint')}</Link>
                <Button variant="ghost" disabled={pending} onClick={cancel}><X className="h-4 w-4" /> {t('pharmacy.btnCancel')}</Button>
              </>
            ) : (
              <Link href={`/print/pharmacy/dispense/${dispense.id}`} target="_blank" className={buttonVariants({ variant: 'outline' })}><Printer className="h-4 w-4" /> {t('pharmacy.btnPrintReceipt')}</Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
