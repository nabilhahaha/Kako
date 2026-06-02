'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { upsertSupplier, toggleSupplierActive, recordSupplierPayment } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { FormSection } from '@/components/shared/form-section';
import { ListSearch } from '@/components/list-search';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/erp/constants';
import { formatCurrency } from '@/lib/utils';
import type { Branch, PaymentMethod, Supplier } from '@/lib/erp/types';
import { Plus, Pencil, Loader2, X, Truck, FileText, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';

export function SuppliersManager({
  suppliers,
  branches,
  q = '',
}: {
  suppliers: Supplier[];
  branches: Branch[];
  q?: string;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<Supplier | null | 'new'>(null);
  const [payFor, setPayFor] = useState<Supplier | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await upsertSupplier(formData);
      if (!res.ok) {
        toast.error(res.error ?? t('suppliers.toastError'));
        return;
      }
      toast.success(editing === 'new' ? t('suppliers.toastCreated') : t('suppliers.toastUpdated'));
      setEditing(null);
      router.refresh();
    });
  }

  function onToggle(s: Supplier) {
    startTransition(async () => {
      const res = await toggleSupplierActive(s.id, !s.is_active);
      if (!res.ok) toast.error(res.error ?? t('suppliers.toastError'));
      else router.refresh();
    });
  }

  const current = editing === 'new' ? null : editing;
  const totalPayable = suppliers.reduce((s, x) => s + Number(x.balance || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {editing === null && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> {t('suppliers.btnNew')}
          </Button>
        )}
        <Badge variant="secondary" className="text-sm">
          {t('suppliers.totalPayable')}: {formatCurrency(totalPayable)}
        </Badge>
        <ListSearch placeholder={t('suppliers.searchPlaceholder')} className="w-full sm:ms-auto sm:w-56" />
      </div>

      {editing !== null && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">
                {editing === 'new' ? t('suppliers.formTitleNew') : t('suppliers.formTitleEdit', { name: current?.name_ar || current?.name || '' })}
              </h3>
              <button onClick={() => setEditing(null)} className="rounded-md p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              {current && <input type="hidden" name="id" value={current.id} />}
              <div className="space-y-5">
                <FormSection title={t('suppliers.sectionIdentity')}>
                  <Field label={t('suppliers.fieldCode')}><Input name="code" dir="ltr" defaultValue={current?.code ?? ''} required /></Field>
                  <Field label={t('suppliers.fieldNameAr')}><Input name="name_ar" defaultValue={current?.name_ar ?? ''} /></Field>
                  <Field label={t('suppliers.fieldNameEn')}><Input name="name" defaultValue={current?.name ?? ''} required /></Field>
                </FormSection>
                <FormSection title={t('suppliers.sectionContact')}>
                  <Field label={t('suppliers.fieldPhone')}><Input name="phone" dir="ltr" defaultValue={current?.phone ?? ''} /></Field>
                  <Field label={t('suppliers.fieldEmail')}><Input name="email" type="email" dir="ltr" defaultValue={current?.email ?? ''} /></Field>
                  <Field label={t('suppliers.fieldTaxNumber')}><Input name="tax_number" dir="ltr" defaultValue={current?.tax_number ?? ''} /></Field>
                  <Field label={t('suppliers.fieldCity')}><Input name="city" defaultValue={current?.city ?? ''} /></Field>
                  <Field label={t('suppliers.fieldAddress')}><Input name="address" defaultValue={current?.address ?? ''} /></Field>
                </FormSection>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('suppliers.btnSave')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t('suppliers.btnCancel')}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {suppliers.length === 0 ? (
        <EmptyState
          icon={<Truck />}
          title={q ? t('suppliers.emptyNoResults') : t('suppliers.emptyNoSuppliers')}
          action={!q && editing === null ? (
            <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> {t('suppliers.btnNew')}</Button>
          ) : undefined}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('suppliers.colCode')}</th>
                    <th className="p-3 text-start font-medium">{t('suppliers.colSupplier')}</th>
                    <th className="p-3 text-start font-medium">{t('suppliers.colPhone')}</th>
                    <th className="p-3 text-start font-medium">{t('suppliers.colCity')}</th>
                    <th className="p-3 text-end font-medium">{t('suppliers.colBalance')}</th>
                    <th className="p-3 text-center font-medium">{t('suppliers.colStatus')}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs" dir="ltr">{s.code}</td>
                      <td className="p-3 font-medium">{s.name_ar || s.name}</td>
                      <td className="p-3 text-muted-foreground" dir="ltr">{s.phone || '—'}</td>
                      <td className="p-3 text-muted-foreground">{s.city || '—'}</td>
                      <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(s.balance)}</td>
                      <td className="p-3 text-center">
                        {s.is_active ? <Badge variant="success">{t('suppliers.statusActive')}</Badge> : <Badge variant="destructive">{t('suppliers.statusInactive')}</Badge>}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {Number(s.balance) > 0 && (
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPayFor(s)}>
                              <Wallet className="h-3.5 w-3.5" /> {t('suppliers.btnPay')}
                            </Button>
                          )}
                          <Link href={`/suppliers/${s.id}`} className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('suppliers.ariaStatement')} title={t('suppliers.ariaStatementTitle')}>
                            <FileText className="h-4 w-4" />
                          </Link>
                          <button onClick={() => setEditing(s)} className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('suppliers.ariaEdit')}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <Button variant="ghost" size="sm" disabled={pending} onClick={() => onToggle(s)} className="text-xs">
                            {s.is_active ? t('suppliers.btnDeactivate') : t('suppliers.btnActivate')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {payFor && (
        <SupplierPaymentDialog
          supplier={payFor}
          branches={branches}
          onClose={() => setPayFor(null)}
          onDone={() => {
            setPayFor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function SupplierPaymentDialog({
  supplier,
  branches,
  onClose,
  onDone,
}: {
  supplier: Supplier;
  branches: Branch[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [amount, setAmount] = useState(Number(supplier.balance).toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await recordSupplierPayment({
        supplier_id: supplier.id,
        branch_id: branchId,
        amount: Number(amount),
        payment_method: method,
        reference_number: ref,
        payment_date: date,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('suppliers.toastError'));
        return;
      }
      toast.success(t('suppliers.toastPaymentSuccess'));
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t('suppliers.payDialogTitle', { name: supplier.name_ar || supplier.name })}</h3>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('suppliers.payDialogAmountDue')} <span dir="ltr" className="font-semibold tabular-nums">{formatCurrency(supplier.balance)}</span>
          </p>
          {branches.length === 0 ? (
            <p className="text-sm text-warning">{t('suppliers.payDialogNoBranch')}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('suppliers.payFieldBranch')}>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('suppliers.payFieldAmount')}>
                <Input type="number" step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label={t('suppliers.payFieldMethod')}>
                <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>{m[locale]}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('suppliers.payFieldRef')}>
                <Input dir="ltr" value={ref} onChange={(e) => setRef(e.target.value)} />
              </Field>
              <Field label={t('suppliers.payFieldDate')}>
                <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending || branches.length === 0}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('suppliers.btnConfirmPayment')}
            </Button>
            <Button variant="outline" onClick={onClose}>{t('suppliers.btnCancel')}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
