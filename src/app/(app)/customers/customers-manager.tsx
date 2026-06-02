'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { upsertCustomer, toggleCustomerActive, requestCustomerApproval, requestCreditLimitChange } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field-error';
import { FormSection } from '@/components/shared/form-section';
import { EmptyState } from '@/components/shared/empty-state';
import { Attachments } from '@/components/shared/attachments';
import { formatCurrency } from '@/lib/utils';
import { VISIT_DAYS, CUSTOMER_ACCOUNT_TYPES, CUSTOMER_STATUSES, CUSTOMER_PAYMENT_TYPES } from '@/lib/erp/constants';
import { importCustomers, approveCustomer, rejectCustomer } from './actions';
import type { Area, Branch, CustomerLookup, CustomerLookupKind, ErpCustomer, Profile, Region } from '@/lib/erp/types';
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
  lookups = [],
  regions = [],
  areas = [],
  canApprove = false,
  customFields = [],
}: {
  customers: ErpCustomer[];
  branches: Branch[];
  reps: Rep[];
  lookups?: CustomerLookup[];
  regions?: Region[];
  areas?: Area[];
  canApprove?: boolean;
  customFields?: CustomFieldDef[];
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<ErpCustomer | null | 'new'>(null);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<{ segment: string; classification: string; channel: string }>({ segment: '', classification: '', channel: '' });
  const [errors, setErrors] = useState<{ code?: string; name?: string }>({});
  const [creditLimitInput, setCreditLimitInput] = useState('');
  const [pending, startTransition] = useTransition();

  const ar = locale === 'ar';
  const byKind = (kind: CustomerLookupKind) => lookups.filter((l) => l.kind === kind);
  const segments = byKind('segment');
  const classes = byKind('classification');
  const channels = byKind('channel');
  const businessTypes = byKind('business_type');
  const lookupName = (id: string | null) => {
    if (!id) return '';
    const l = lookups.find((x) => x.id === id);
    return l ? (ar ? l.name_ar || l.name : l.name) : '';
  };

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

  function onReject(id: string) {
    const reason = window.prompt(t('customers.rejectReasonPrompt'));
    if (!reason || !reason.trim()) return;
    startTransition(async () => {
      const res = await rejectCustomer(id, reason.trim());
      if (!res.ok) toast.error(res.error ?? t('customers.toastError'));
      else { toast.success(t('customers.toastUpdated')); router.refresh(); }
    });
  }

  // 4-state status badge (approval first, then active/suspended for approved).
  function statusBadge(c: ErpCustomer) {
    switch (c.approval_status) {
      case 'draft': return <Badge variant="secondary">{t('customers.statusDraft')}</Badge>;
      case 'pending': return <Badge variant="warning">{t('customers.statusPending')}</Badge>;
      case 'rejected': return <Badge variant="destructive">{t('customers.statusRejected')}</Badge>;
      default: return c.is_active
        ? <Badge variant="success">{t('customers.statusActive')}</Badge>
        : <Badge variant="destructive">{t('customers.statusInactive')}</Badge>;
    }
  }
  const needsDecision = (c: ErpCustomer) => c.approval_status === 'pending' || c.approval_status === 'draft' || c.approval_status === 'rejected';

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
    return customers.filter((c) => {
      if (filters.segment && c.segment_id !== filters.segment) return false;
      if (filters.classification && c.classification_id !== filters.classification) return false;
      if (filters.channel && c.channel_id !== filters.channel) return false;
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.name_ar || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
      );
    });
  }, [customers, query, filters]);

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
        {segments.length > 0 && (
          <select value={filters.segment} onChange={(e) => setFilters((f) => ({ ...f, segment: e.target.value }))} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">{t('customers.filterAllSegments')}</option>
            {segments.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
          </select>
        )}
        {classes.length > 0 && (
          <select value={filters.classification} onChange={(e) => setFilters((f) => ({ ...f, classification: e.target.value }))} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">{t('customers.filterAllClasses')}</option>
            {classes.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
          </select>
        )}
        {channels.length > 0 && (
          <select value={filters.channel} onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">{t('customers.filterAllChannels')}</option>
            {channels.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
          </select>
        )}
        <div className="relative w-full sm:ms-auto sm:w-auto">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('customers.searchPlaceholder')} className="w-full ps-9 sm:w-64" />
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
            <form key={current?.id ?? 'new'} onSubmit={onSubmit} className="space-y-4">
              {current && <input type="hidden" name="id" value={current.id} />}
              <div className="space-y-5">
                {/* UX-2: grouped into labeled sections (Identity / Contact / Commercial / Classification / Hierarchy / Location) */}
                <FormSection title={t('customers.sectionIdentity')}>
                  <Field label={t('customers.fieldCode')}><Input name="code" dir="ltr" defaultValue={current?.code ?? ''} onChange={() => setErrors((x) => ({ ...x, code: undefined }))} /><FieldError>{errors.code}</FieldError></Field>
                  <Field label={t('customers.fieldNameAr')}><Input name="name_ar" defaultValue={current?.name_ar ?? ''} /></Field>
                  <Field label={t('customers.fieldNameEn')}><Input name="name" defaultValue={current?.name ?? ''} onChange={() => setErrors((x) => ({ ...x, name: undefined }))} /><FieldError>{errors.name}</FieldError></Field>
                </FormSection>

                <FormSection title={t('customers.sectionContact')}>
                  <Field label={t('customers.fieldPhone')}><Input name="phone" dir="ltr" defaultValue={current?.phone ?? ''} /></Field>
                  <Field label={t('customers.fieldEmail')}><Input name="email" type="email" dir="ltr" defaultValue={current?.email ?? ''} /></Field>
                  <Field label={t('customers.fieldContactPerson')}><Input name="contact_person" defaultValue={current?.contact_person ?? ''} /></Field>
                  <Field label={t('customers.fieldContactPhone')}><Input name="contact_phone" dir="ltr" defaultValue={current?.contact_phone ?? ''} /></Field>
                  <Field label={t('customers.fieldAddress')}><Input name="address" defaultValue={current?.address ?? ''} /></Field>
                  <Field label={t('customers.fieldCity')}><Input name="city" defaultValue={current?.city ?? ''} /></Field>
                  <Field label={t('customers.fieldNationalAddress')}><Input name="national_address" defaultValue={current?.national_address ?? ''} /></Field>
                </FormSection>

                <FormSection title={t('customers.sectionCommercial')}>
                  <Field label={t('customers.fieldCreditLimit')}><Input name="credit_limit" type="number" step="0.01" dir="ltr" defaultValue={current?.credit_limit ?? 0} /></Field>
                  <Field label={t('customers.fieldPaymentTerms')}><Input name="payment_terms_days" type="number" dir="ltr" defaultValue={current?.payment_terms_days ?? ''} /></Field>
                  <Field label={t('customers.fieldTaxNumber')}><Input name="tax_number" dir="ltr" defaultValue={current?.tax_number ?? ''} /></Field>
                  <Field label={t('customers.fieldCrNumber')}><Input name="cr_number" dir="ltr" defaultValue={current?.cr_number ?? ''} /></Field>
                </FormSection>

                <HierarchyAccountSection
                  current={current}
                  parentOptions={customers.filter((c) => c.customer_account_type !== 'branch' && c.id !== current?.id)}
                  businessTypes={businessTypes}
                  ar={ar}
                  t={t}
                />

                <FormSection title={t('customers.sectionClassification')}>
                  <Field label={t('customers.fieldSegment')}>
                    <select name="segment_id" defaultValue={current?.segment_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">{t('customers.optionNone')}</option>
                      {segments.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
                    </select>
                  </Field>
                  <Field label={t('customers.fieldClassification')}>
                    <select name="classification_id" defaultValue={current?.classification_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">{t('customers.optionNone')}</option>
                      {classes.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
                    </select>
                  </Field>
                  <Field label={t('customers.fieldChannel')}>
                    <select name="channel_id" defaultValue={current?.channel_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">{t('customers.optionNone')}</option>
                      {channels.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
                    </select>
                  </Field>
                </FormSection>

                <FormSection title={t('customers.sectionHierarchy')}>
                  <Field label={t('customers.fieldBranch')}>
                    <select name="branch_id" defaultValue={current?.branch_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">{t('customers.optionAllBranches')}</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('customers.fieldRegion')}>
                    <select name="region_id" defaultValue={current?.region_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">{t('customers.optionNone')}</option>
                      {regions.map((r) => <option key={r.id} value={r.id}>{ar ? r.name_ar || r.name : r.name}</option>)}
                    </select>
                  </Field>
                  <Field label={t('customers.fieldArea')}>
                    <select name="area_id" defaultValue={current?.area_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">{t('customers.optionNone')}</option>
                      {areas.map((a) => <option key={a.id} value={a.id}>{ar ? a.name_ar || a.name : a.name}</option>)}
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
                </FormSection>

                <FormSection title={t('customers.sectionLocation')}>
                  <Field label={t('customers.fieldLatitude')}><Input name="latitude" type="number" step="any" dir="ltr" defaultValue={current?.latitude ?? ''} /></Field>
                  <Field label={t('customers.fieldLongitude')}><Input name="longitude" type="number" step="any" dir="ltr" defaultValue={current?.longitude ?? ''} /></Field>
                </FormSection>
              </div>
              {/* Dynamic Forms: custom fields appear automatically + submit as `custom` JSON */}
              <DynamicCustomFields
                fields={customFields}
                initial={(current as { custom?: Record<string, unknown> } | null)?.custom ?? {}}
              />
              {current && <Attachments entity="customer" recordId={current.id} canManage />}
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('customers.btnSave')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t('customers.btnCancel')}</Button>
                {current && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={async () => {
                      const res = await requestCustomerApproval(current.id);
                      if (!res.ok) return toast.error(res.error ?? t('workflow.toast.error'));
                      toast.success(t('workflow.toast.requested'));
                      router.refresh();
                    }}
                  >
                    {t('workflow.requestApproval')}
                  </Button>
                )}
              </div>
              {current && (
                <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
                  <Field label={t('workflow.creditLimit.requestLabel')}>
                    <Input
                      type="number" step="0.01" dir="ltr" className="max-w-[12rem]"
                      value={creditLimitInput}
                      onChange={(e) => setCreditLimitInput(e.target.value)}
                    />
                  </Field>
                  <Button
                    type="button" variant="secondary" disabled={pending}
                    onClick={async () => {
                      const amt = parseFloat(creditLimitInput);
                      if (!Number.isFinite(amt) || amt < 0) return toast.error(t('workflow.toast.error'));
                      const res = await requestCreditLimitChange(current.id, amt);
                      if (!res.ok) return toast.error(res.error ?? t('workflow.toast.error'));
                      toast.success(t('workflow.toast.requested'));
                      setCreditLimitInput('');
                      router.refresh();
                    }}
                  >
                    {t('workflow.creditLimit.requestButton')}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            {customers.length === 0 ? (
              <EmptyState
                icon={<Users />}
                title={t('customers.emptyNoCustomers')}
                description={t('customers.emptyNoCustomersHint')}
                action={editing === null ? (
                  <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> {t('customers.btnNew')}</Button>
                ) : undefined}
              />
            ) : (
              <EmptyState icon={<Search />} title={t('customers.emptyNoResults')} />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Mobile (UX-3): cards instead of a wide horizontal-scroll table */}
            <div className="divide-y sm:hidden">
              {filtered.map((c) => {
                const overLimit = Number(c.credit_limit) > 0 && Number(c.balance) > Number(c.credit_limit);
                const segClass = [lookupName(c.segment_id), lookupName(c.classification_id)].filter(Boolean).join(' · ');
                return (
                  <div key={c.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.name_ar || c.name}</p>
                        <p className="font-mono text-xs text-muted-foreground" dir="ltr">{c.code}</p>
                      </div>
                      {statusBadge(c)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {segClass && <span>{segClass}</span>}
                      <span>{branchName(c.branch_id)}</span>
                      <span dir="ltr" className="inline-flex items-center gap-1 tabular-nums">
                        {t('customers.colBalance')}: {overLimit && <AlertTriangle className="h-3 w-3 text-warning" />}{formatCurrency(c.balance)}
                      </span>
                    </div>
                    {c.approval_status === 'rejected' && c.rejection_reason && (
                      <p className="text-xs text-destructive">{c.rejection_reason}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1">
                      {needsDecision(c) && canApprove && (
                        <>
                          <Button variant="ghost" size="sm" disabled={pending} onClick={() => onApprove(c.id)} className="text-xs text-success">
                            <BadgeCheck className="h-3.5 w-3.5" /> {t('customers.btnApprove')}
                          </Button>
                          <Button variant="ghost" size="sm" disabled={pending} onClick={() => onReject(c.id)} className="text-xs text-destructive">
                            {t('customers.btnReject')}
                          </Button>
                        </>
                      )}
                      <Link href={`/customers/${c.id}`} className="rounded-md p-2 hover:bg-secondary" aria-label={t('customers.ariaStatement')}>
                        <FileText className="h-4 w-4" />
                      </Link>
                      <Link href={`/print/statement/${c.id}`} target="_blank" className="rounded-md p-2 hover:bg-secondary" aria-label={t('customers.ariaPrint')}>
                        <Printer className="h-4 w-4" />
                      </Link>
                      <button onClick={() => setEditing(c)} className="rounded-md p-2 hover:bg-secondary" aria-label={t('customers.ariaEdit')}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => onToggle(c)} className="text-xs">
                        {c.is_active ? t('customers.btnDeactivate') : t('customers.btnActivate')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  {/* sticky-ish header tone + readable density for mobile scroll */}
                  <tr>
                    <th className="p-3 text-start font-medium">{t('customers.colCode')}</th>
                    <th className="p-3 text-start font-medium">{t('customers.colCustomer')}</th>
                    <th className="p-3 text-start font-medium">{t('customers.colSegment')}</th>
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
                        <td className="whitespace-nowrap p-3 font-mono text-xs" dir="ltr">{c.code}</td>
                        <td className="p-3 font-medium">{c.name_ar || c.name}</td>
                        <td className="whitespace-nowrap p-3 text-muted-foreground">
                          {[lookupName(c.segment_id), lookupName(c.classification_id)].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="whitespace-nowrap p-3 text-muted-foreground">{branchName(c.branch_id)}</td>
                        <td className="whitespace-nowrap p-3 text-end tabular-nums" dir="ltr">{formatCurrency(c.credit_limit)}</td>
                        <td className="whitespace-nowrap p-3 text-end tabular-nums" dir="ltr">
                          <span className="inline-flex items-center gap-1">
                            {overLimit && <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                            {formatCurrency(c.balance)}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {statusBadge(c)}
                          {c.approval_status === 'rejected' && c.rejection_reason && (
                            <span className="ms-1 text-xs text-destructive" title={c.rejection_reason}>ⓘ</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            {needsDecision(c) && canApprove && (
                              <>
                                <Button variant="ghost" size="sm" disabled={pending} onClick={() => onApprove(c.id)} className="text-xs text-success">
                                  <BadgeCheck className="h-3.5 w-3.5" /> {t('customers.btnApprove')}
                                </Button>
                                <Button variant="ghost" size="sm" disabled={pending} onClick={() => onReject(c.id)} className="text-xs text-destructive">
                                  {t('customers.btnReject')}
                                </Button>
                              </>
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

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

/** FP-0: customer hierarchy + master flags. Keyed by record id in the parent so
 *  its local state (account type → parent visibility) resets on record switch. */
function HierarchyAccountSection({
  current,
  parentOptions,
  businessTypes,
  ar,
  t,
}: {
  current: ErpCustomer | null;
  parentOptions: ErpCustomer[];
  businessTypes: CustomerLookup[];
  ar: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [accountType, setAccountType] = useState<string>(current?.customer_account_type ?? 'independent');
  const lkName = (l: CustomerLookup) => (ar ? l.name_ar || l.name : l.name);
  // null = inherit company default; 'true'/'false' = explicit override.
  const reqApprovalDefault =
    current?.requires_customer_approval == null ? '' : current.requires_customer_approval ? 'true' : 'false';
  return (
    <FormSection title={t('customers.sectionAccount')}>
      <Field label={t('customers.fieldAccountType')}>
        <select name="customer_account_type" value={accountType} onChange={(e) => setAccountType(e.target.value)} className={selectClass}>
          {CUSTOMER_ACCOUNT_TYPES.map((o) => <option key={o.value} value={o.value}>{ar ? o.ar : o.en}</option>)}
        </select>
      </Field>
      {accountType === 'branch' && (
        <Field label={t('customers.fieldParentCustomer')}>
          <select name="parent_customer_id" defaultValue={current?.parent_customer_id ?? ''} className={selectClass}>
            <option value="">{t('customers.optionNone')}</option>
            {parentOptions.map((c) => <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>)}
          </select>
        </Field>
      )}
      <Field label={t('customers.fieldBusinessType')}>
        <select name="business_type_id" defaultValue={current?.business_type_id ?? ''} className={selectClass}>
          <option value="">{t('customers.optionNone')}</option>
          {businessTypes.map((l) => <option key={l.id} value={l.id}>{lkName(l)}</option>)}
        </select>
      </Field>
      <Field label={t('customers.fieldPaymentType')}>
        <select name="payment_type" defaultValue={current?.payment_type ?? ''} className={selectClass}>
          <option value="">{t('customers.optionNone')}</option>
          {CUSTOMER_PAYMENT_TYPES.map((o) => <option key={o.value} value={o.value}>{ar ? o.ar : o.en}</option>)}
        </select>
      </Field>
      <Field label={t('customers.fieldCustomerStatus')}>
        <select name="customer_status" defaultValue={current?.customer_status ?? 'active'} className={selectClass}>
          {CUSTOMER_STATUSES.map((o) => <option key={o.value} value={o.value}>{ar ? o.ar : o.en}</option>)}
        </select>
      </Field>
      <Field label={t('customers.fieldRequiresApproval')}>
        <select name="requires_customer_approval" defaultValue={reqApprovalDefault} className={selectClass}>
          <option value="">{t('customers.optionInherit')}</option>
          <option value="true">{t('customers.optionYes')}</option>
          <option value="false">{t('customers.optionNo')}</option>
        </select>
      </Field>
      <Field label={t('customers.fieldVatRegistered')}>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="is_vat_registered" value="true" defaultChecked={current?.is_vat_registered ?? false} className="h-4 w-4" />
          {t('customers.fieldVatRegisteredHint')}
        </label>
      </Field>
      <Field label={t('customers.fieldCreditControl')}>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="credit_control_enabled" value="true" defaultChecked={current?.credit_control_enabled ?? true} className="h-4 w-4" />
          {t('customers.fieldCreditControlHint')}
        </label>
      </Field>
    </FormSection>
  );
}
