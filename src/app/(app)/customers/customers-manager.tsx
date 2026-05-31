'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { upsertCustomer, toggleCustomerActive } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field-error';
import { formatCurrency } from '@/lib/utils';
import { VISIT_DAYS } from '@/lib/erp/constants';
import { importCustomers, approveCustomer } from './actions';
import type { Branch, ErpCustomer, Profile } from '@/lib/erp/types';
import type { CustomFieldDef } from '@/lib/erp/custom-fields';
import { DynamicCustomFields } from '@/components/forms/dynamic-custom-fields';
import Link from 'next/link';
import { Plus, Pencil, Loader2, X, Users, Search, AlertTriangle, FileText, Upload, Printer, BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';

type Rep = Pick<Profile, 'id' | 'full_name' | 'email'>;

export function CustomersManager({
  customers,
  branches,
  reps,
  isSuperAdmin,
  customFields = [],
}: {
  customers: ErpCustomer[];
  branches: Branch[];
  reps: Rep[];
  isSuperAdmin: boolean;
  customFields?: CustomFieldDef[];
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<ErpCustomer | null | 'new'>(null);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState<{ code?: string; name?: string }>({});
  const [pending, startTransition] = useTransition();

  function onApprove(id: string) {
    startTransition(async () => {
      const res = await approveCustomer(id);
      if (!res.ok) toast.error(res.error ?? t('customers.toastError'));
      else {
        toast.success(t('customers.toastApproved'));
        router.refresh();
      }
    });
  }

  const repName = (id: string | null) => {
    if (!id) return '';
    const r = reps.find((x) => x.id === id);
    return r?.full_name || r?.email || '';
  };

  const branchName = (id: string | null) => {
    if (!id) return t('customers.branchGeneral');
    const b = branches.find((x) => x.id === id);
    return b ? b.name_ar || b.name : '—';
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.name_ar || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q),
    );
  }, [customers, query]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const next: { code?: string; name?: string } = {};
    if (!String(formData.get('code') ?? '').trim()) next.code = t('customers.errCodeRequired');
    if (!String(formData.get('name') ?? '').trim()) next.name = t('customers.errNameRequired');
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    startTransition(async () => {
      const res = await upsertCustomer(formData);
      if (!res.ok) {
        toast.error(res.error ?? t('customers.toastError'));
        return;
      }
      toast.success(editing === 'new' ? t('customers.toastCreated') : t('customers.toastUpdated'));
      setEditing(null);
      router.refresh();
    });
  }

  function onToggle(c: ErpCustomer) {
    startTransition(async () => {
      const res = await toggleCustomerActive(c.id, !c.is_active);
      if (!res.ok) toast.error(res.error ?? t('customers.toastError'));
      else router.refresh();
    });
  }

  const current = editing === 'new' ? null : editing;
  const totalReceivable = customers.reduce((s, x) => s + Number(x.balance || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {editing === null && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> {t('customers.btnNew')}
          </Button>
        )}
        {editing === null && (
          <Button variant="outline" onClick={() => setImporting(true)}>
            <Upload className="h-4 w-4" /> {t('customers.btnImport')}
          </Button>
        )}
        <Badge variant="secondary" className="text-sm">
          {t('customers.totalReceivable')}: {formatCurrency(totalReceivable)}
        </Badge>
        <div className="relative ms-auto">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('customers.searchPlaceholder')} className="w-56 ps-9" />
        </div>
      </div>

      {editing !== null && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">
                {editing === 'new' ? t('customers.formTitleNew') : t('customers.formTitleEdit', { name: current?.name_ar || current?.name || '' })}
              </h3>
              <button onClick={() => setEditing(null)} className="rounded-md p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              {current && <input type="hidden" name="id" value={current.id} />}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label={t('customers.fieldCode')}><Input name="code" dir="ltr" defaultValue={current?.code ?? ''} onChange={() => setErrors((x) => ({ ...x, code: undefined }))} /><FieldError>{errors.code}</FieldError></Field>
                <Field label={t('customers.fieldNameAr')}><Input name="name_ar" defaultValue={current?.name_ar ?? ''} /></Field>
                <Field label={t('customers.fieldNameEn')}><Input name="name" defaultValue={current?.name ?? ''} onChange={() => setErrors((x) => ({ ...x, name: undefined }))} /><FieldError>{errors.name}</FieldError></Field>
                <Field label={t('customers.fieldPhone')}><Input name="phone" dir="ltr" defaultValue={current?.phone ?? ''} /></Field>
                <Field label={t('customers.fieldEmail')}><Input name="email" type="email" dir="ltr" defaultValue={current?.email ?? ''} /></Field>
                <Field label={t('customers.fieldTaxNumber')}><Input name="tax_number" dir="ltr" defaultValue={current?.tax_number ?? ''} /></Field>
                <Field label={t('customers.fieldCity')}><Input name="city" defaultValue={current?.city ?? ''} /></Field>
                <Field label={t('customers.fieldAddress')}><Input name="address" defaultValue={current?.address ?? ''} /></Field>
                <Field label={t('customers.fieldCreditLimit')}><Input name="credit_limit" type="number" step="0.01" dir="ltr" defaultValue={current?.credit_limit ?? 0} /></Field>
                <Field label={t('customers.fieldBranch')}>
                  <select name="branch_id" defaultValue={current?.branch_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">{t('customers.optionAllBranches')}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('customers.fieldSalesman')}>
                  <select name="salesman_id" defaultValue={current?.salesman_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">{t('customers.optionNoSalesman')}</option>
                    {reps.map((r) => (
                      <option key={r.id} value={r.id}>{r.full_name || r.email}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('customers.fieldVisitDay')}>
                  <select name="visit_day" defaultValue={current?.visit_day ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">{t('customers.optionNoVisitDay')}</option>
                    {VISIT_DAYS.map((d) => (
                      <option key={d.value} value={d.value}>{d[locale]}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {/* Dynamic Forms: custom fields appear automatically + submit as `custom` JSON */}
              <DynamicCustomFields
                fields={customFields}
                initial={(current as { custom?: Record<string, unknown> } | null)?.custom ?? {}}
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('customers.btnSave')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t('customers.btnCancel')}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <Users className="h-8 w-8" />
            <p>{customers.length === 0 ? t('customers.emptyNoCustomers') : t('customers.emptyNoResults')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('customers.colCode')}</th>
                    <th className="p-3 text-start font-medium">{t('customers.colCustomer')}</th>
                    <th className="p-3 text-start font-medium">{t('customers.colBranch')}</th>
                    <th className="p-3 text-end font-medium">{t('customers.colCreditLimit')}</th>
                    <th className="p-3 text-end font-medium">{t('customers.colBalance')}</th>
                    <th className="p-3 text-center font-medium">{t('customers.colStatus')}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const overLimit =
                      Number(c.credit_limit) > 0 &&
                      Number(c.balance) > Number(c.credit_limit);
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-secondary/30">
                        <td className="p-3 font-mono text-xs" dir="ltr">{c.code}</td>
                        <td className="p-3 font-medium">{c.name_ar || c.name}</td>
                        <td className="p-3 text-muted-foreground">{branchName(c.branch_id)}</td>
                        <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(c.credit_limit)}</td>
                        <td className="p-3 text-left tabular-nums" dir="ltr">
                          <span className="inline-flex items-center gap-1">
                            {overLimit && <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                            {formatCurrency(c.balance)}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {!c.is_approved ? (
                            <Badge variant="warning">{t('customers.statusPending')}</Badge>
                          ) : c.is_active ? (
                            <Badge variant="success">{t('customers.statusActive')}</Badge>
                          ) : (
                            <Badge variant="destructive">{t('customers.statusInactive')}</Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            {!c.is_approved && isSuperAdmin && (
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onApprove(c.id)} className="text-xs text-success">
                                <BadgeCheck className="h-3.5 w-3.5" /> {t('customers.btnApprove')}
                              </Button>
                            )}
                            <Link href={`/customers/${c.id}`} className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('customers.ariaStatement')} title={t('customers.ariaStatement')}>
                              <FileText className="h-4 w-4" />
                            </Link>
                            <Link href={`/print/statement/${c.id}`} target="_blank" className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('customers.ariaPrint')} title={t('customers.ariaPrintTitle')}>
                              <Printer className="h-4 w-4" />
                            </Link>
                            <button onClick={() => setEditing(c)} className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('customers.ariaEdit')}>
                              <Pencil className="h-4 w-4" />
                            </button>
                            <Button variant="ghost" size="sm" disabled={pending} onClick={() => onToggle(c)} className="text-xs">
                              {c.is_active ? t('customers.btnDeactivate') : t('customers.btnActivate')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {importing && (
        <ImportDialog
          branches={branches}
          reps={reps}
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

interface ParsedRow {
  code: string;
  name: string;
  name_ar?: string;
  phone?: string;
  city?: string;
  credit_limit?: number;
}

// Minimal CSV parser: first row is headers. Recognized headers (ar or en):
// code/كود, name/الاسم, name_ar/الاسم بالعربي, phone/الهاتف, city/المدينة,
// credit_limit/حد الائتمان.
function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = (keys: string[]) => headers.findIndex((h) => keys.includes(h));
  const iCode = idx(['code', 'كود', 'الكود']);
  const iName = idx(['name', 'الاسم', 'name_en']);
  const iNameAr = idx(['name_ar', 'الاسم بالعربي', 'الاسم العربي']);
  const iPhone = idx(['phone', 'الهاتف', 'تليفون', 'الموبايل']);
  const iCity = idx(['city', 'المدينة', 'المنطقة']);
  const iCredit = idx(['credit_limit', 'حد الائتمان', 'الائتمان']);
  const at = (cols: string[], i: number) => (i >= 0 ? (cols[i] ?? '').trim() : '');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    return {
      code: at(cols, iCode),
      name: at(cols, iName) || at(cols, iNameAr),
      name_ar: at(cols, iNameAr) || undefined,
      phone: at(cols, iPhone) || undefined,
      city: at(cols, iCity) || undefined,
      credit_limit: Number(at(cols, iCredit)) || 0,
    };
  });
}

function ImportDialog({
  branches,
  reps,
  onClose,
  onDone,
}: {
  branches: Branch[];
  reps: Rep[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [branchId, setBranchId] = useState('');
  const [repId, setRepId] = useState('');
  const [pending, startTransition] = useTransition();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || '')).filter((r) => r.code && r.name);
      if (parsed.length === 0) toast.error(t('customers.toastImportNoRows'));
      setRows(parsed);
    };
    reader.readAsText(file, 'utf-8');
  }

  function doImport() {
    startTransition(async () => {
      const res = await importCustomers(rows, branchId || null, repId || null);
      if (!res.ok) {
        toast.error(res.error ?? t('customers.toastImportError'));
        return;
      }
      toast.success(t('customers.toastImportSuccess', { count: res.data?.count ?? 0 }));
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t('customers.importTitle')}</h3>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('customers.importHint')}
            <span dir="ltr" className="mx-1 font-mono">code, name, name_ar, phone, city, credit_limit</span>
          </p>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} className="block w-full text-sm" />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('customers.importFieldBranch')}>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{t('customers.importOptGeneral')}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>)}
              </select>
            </Field>
            <Field label={t('customers.importFieldSalesman')}>
              <select value={repId} onChange={(e) => setRepId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{t('customers.importOptNoSalesman')}</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.full_name || r.email}</option>)}
              </select>
            </Field>
          </div>

          {rows.length > 0 && (
            <div className="rounded-md border">
              <p className="border-b p-2 text-sm font-medium">{t('customers.importPreview', { count: rows.length })}</p>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {rows.slice(0, 20).map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-1.5 font-mono" dir="ltr">{r.code}</td>
                        <td className="p-1.5">{r.name_ar || r.name}</td>
                        <td className="p-1.5 text-muted-foreground" dir="ltr">{r.phone || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={doImport} disabled={pending || rows.length === 0}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}{' '}
              {rows.length > 0 ? t('customers.btnImportWithCount', { count: rows.length }) : t('customers.btnImportAction')}
            </Button>
            <Button variant="outline" onClick={onClose}>{t('customers.btnCancel')}</Button>
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
