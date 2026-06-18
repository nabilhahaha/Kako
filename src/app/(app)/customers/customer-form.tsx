'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field-error';
import { FormSection } from '@/components/shared/form-section';
import { Attachments } from '@/components/shared/attachments';
import { DynamicCustomFields } from '@/components/forms/dynamic-custom-fields';
import { VISIT_DAYS, CUSTOMER_ACCOUNT_TYPES, CUSTOMER_STATUSES, CUSTOMER_PAYMENT_TYPES } from '@/lib/erp/constants';
import { resolveLayout, type GovInputs, type AccessLevel } from '@/lib/erp/field-governance';
import { upsertCustomer, requestCustomerApproval, requestCreditLimitChange, requestCustomerGpsChange } from './actions';
import { loadActionPolicyConfig } from '../settings/action-policies/actions';
import { useI18n } from '@/lib/i18n/provider';
import { useCriticalAction } from '@/lib/critical-action';
import type { Area, Branch, CustomerLookup, CustomerLookupKind, ErpCustomer, Profile, Region } from '@/lib/erp/types';
import type { CustomFieldDef } from '@/lib/erp/custom-fields';

type Rep = Pick<Profile, 'id' | 'full_name' | 'email'>;

/**
 * CustomerForm — the canonical create/edit form for a customer, extracted
 * verbatim from CustomersManager so it can be reused by Create, Edit, the
 * Customer 360 Profile tab, and future onboarding flows. Same fields,
 * validations, field-governance, custom fields, attachments, and critical-action
 * flows; same `upsertCustomer` and request actions. The parent controls
 * open/close + refresh via `onSaved`/`onCancel` (identical to the prior
 * setEditing(null)+router.refresh() behaviour). No business-logic, permission,
 * RLS, or workflow change.
 */
export function CustomerForm({
  customer,
  customers,
  branches,
  reps,
  lookups = [],
  regions = [],
  areas = [],
  customFields = [],
  gov,
  onSaved,
  onCancel,
}: {
  /** The customer being edited; `null` = create. */
  customer: ErpCustomer | null;
  customers: ErpCustomer[];
  branches: Branch[];
  reps: Rep[];
  lookups?: CustomerLookup[];
  regions?: Region[];
  areas?: Area[];
  customFields?: CustomFieldDef[];
  gov?: GovInputs;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const runCritical = useCriticalAction();
  const [errors, setErrors] = useState<{ code?: string; name?: string }>({});
  const [creditLimitInput, setCreditLimitInput] = useState('');
  const [gpsLat, setGpsLat] = useState('');
  const [gpsLng, setGpsLng] = useState('');
  const [pending, startTransition] = useTransition();

  const ar = locale === 'ar';
  const current = customer;
  const byKind = (kind: CustomerLookupKind) => lookups.filter((l) => l.kind === kind);
  const segments = byKind('segment');
  const classes = byKind('classification');
  const channels = byKind('channel');
  const businessTypes = byKind('business_type');
  const statusReasons = byKind('status_reason');

  // DFG-3: resolve governed access for the record being edited. No governance
  // configured ⇒ empty map ⇒ acc() returns 'edit' ⇒ form behaves as today.
  const govLayout: Map<string, AccessLevel> = gov && gov.fields.length
    ? resolveLayout(gov, (current ?? {}) as unknown as Record<string, unknown>)
    : new Map();
  const acc = (k: string): AccessLevel => govLayout.get(k) ?? 'edit';
  const shown = (k: string) => acc(k) !== 'hidden';
  const ro = (k: string) => acc(k) === 'view';
  const req = (k: string) => acc(k) === 'required';
  const gl = (label: string, required: boolean) => (required ? `${label} *` : label);

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
      toast.success(current ? t('customers.toastUpdated') : t('customers.toastCreated'));
      onSaved();
    });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">
            {current ? t('customers.formTitleEdit', { name: current.name_ar || current.name || '' }) : t('customers.formTitleNew')}
          </h3>
          <button onClick={onCancel} className="rounded-md p-1 hover:bg-secondary">
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
              {shown('phone') && <Field label={gl(t('customers.fieldPhone'), req('phone'))}><Input name="phone" dir="ltr" defaultValue={current?.phone ?? ''} readOnly={ro('phone')} /></Field>}
              {shown('email') && <Field label={gl(t('customers.fieldEmail'), req('email'))}><Input name="email" type="email" dir="ltr" defaultValue={current?.email ?? ''} readOnly={ro('email')} /></Field>}
              {shown('contact_person') && <Field label={gl(t('customers.fieldContactPerson'), req('contact_person'))}><Input name="contact_person" defaultValue={current?.contact_person ?? ''} readOnly={ro('contact_person')} /></Field>}
              {shown('contact_phone') && <Field label={gl(t('customers.fieldContactPhone'), req('contact_phone'))}><Input name="contact_phone" dir="ltr" defaultValue={current?.contact_phone ?? ''} readOnly={ro('contact_phone')} /></Field>}
              {shown('address') && <Field label={gl(t('customers.fieldAddress'), req('address'))}><Input name="address" defaultValue={current?.address ?? ''} readOnly={ro('address')} /></Field>}
              {shown('city') && <Field label={gl(t('customers.fieldCity'), req('city'))}><Input name="city" defaultValue={current?.city ?? ''} readOnly={ro('city')} /></Field>}
              {shown('national_address') && <Field label={gl(t('customers.fieldNationalAddress'), req('national_address'))}><Input name="national_address" defaultValue={current?.national_address ?? ''} readOnly={ro('national_address')} /></Field>}
            </FormSection>

            <FormSection title={t('customers.sectionCommercial')}>
              {shown('credit_limit') && <Field label={gl(t('customers.fieldCreditLimit'), req('credit_limit'))}><Input name="credit_limit" type="number" step="0.01" dir="ltr" defaultValue={current?.credit_limit ?? 0} readOnly={ro('credit_limit')} /></Field>}
              {shown('payment_terms_days') && <Field label={gl(t('customers.fieldPaymentTerms'), req('payment_terms_days'))}><Input name="payment_terms_days" type="number" dir="ltr" defaultValue={current?.payment_terms_days ?? ''} readOnly={ro('payment_terms_days')} /></Field>}
              {shown('tax_number') && <Field label={gl(t('customers.fieldTaxNumber'), req('tax_number'))}><Input name="tax_number" dir="ltr" defaultValue={current?.tax_number ?? ''} readOnly={ro('tax_number')} /></Field>}
              {shown('cr_number') && <Field label={gl(t('customers.fieldCrNumber'), req('cr_number'))}><Input name="cr_number" dir="ltr" defaultValue={current?.cr_number ?? ''} readOnly={ro('cr_number')} /></Field>}
            </FormSection>

            <HierarchyAccountSection
              current={current}
              parentOptions={customers.filter((c) => c.customer_account_type !== 'branch' && c.id !== current?.id)}
              businessTypes={businessTypes}
              statusReasons={statusReasons}
              ar={ar}
              t={t}
            />

            <FormSection title={t('customers.sectionClassification')}>
              {shown('segment_id') && <Field label={gl(t('customers.fieldSegment'), req('segment_id'))}>
                <select name="segment_id" defaultValue={current?.segment_id ?? ''} disabled={ro('segment_id')} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">{t('customers.optionNone')}</option>
                  {segments.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
                </select>
              </Field>}
              {shown('classification_id') && <Field label={gl(t('customers.fieldClassification'), req('classification_id'))}>
                <select name="classification_id" defaultValue={current?.classification_id ?? ''} disabled={ro('classification_id')} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">{t('customers.optionNone')}</option>
                  {classes.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
                </select>
              </Field>}
              {shown('channel_id') && <Field label={gl(t('customers.fieldChannel'), req('channel_id'))}>
                <select name="channel_id" defaultValue={current?.channel_id ?? ''} disabled={ro('channel_id')} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">{t('customers.optionNone')}</option>
                  {channels.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
                </select>
              </Field>}
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
            <Button type="button" variant="outline" onClick={onCancel}>{t('customers.btnCancel')}</Button>
            {current && (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={async () => {
                  const policy = await loadActionPolicyConfig('customer.dataUpdateApproval');
                  if (!policy.enabled) { toast.error(t('actionPolicies.disabledForTenant')); return; }
                  void runCritical({
                    catalogKey: 'customer.dataUpdateApproval',
                    action: t('critical.actions.dataUpdateApproval'),
                    record: locale === 'ar' ? current.name_ar || current.name : current.name,
                    requireReason: policy.reasonRequired,
                    irreversible: policy.irreversible,
                    execute: async (reason) => {
                      const res = await requestCustomerApproval(current.id, reason);
                      return { ok: res.ok, error: res.error };
                    },
                    onDone: () => router.refresh(),
                  });
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
                onClick={() => {
                  const amt = parseFloat(creditLimitInput);
                  if (!Number.isFinite(amt) || amt < 0) return toast.error(t('workflow.toast.error'));
                  void runCritical({
                    catalogKey: 'customer.creditLimitOverride',
                    action: t('critical.actions.creditLimitOverride'),
                    record: `${locale === 'ar' ? current.name_ar || current.name : current.name} · ${amt}`,
                    execute: async (reason) => {
                      const res = await requestCreditLimitChange(current.id, amt, reason);
                      return { ok: res.ok, error: res.error };
                    },
                    onDone: () => { setCreditLimitInput(''); router.refresh(); },
                  });
                }}
              >
                {t('workflow.creditLimit.requestButton')}
              </Button>
            </div>
          )}
          {current && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
              <Field label={t('customers.gpsLat')}>
                <Input type="number" step="0.000001" dir="ltr" className="max-w-[10rem]"
                  value={gpsLat} onChange={(e) => setGpsLat(e.target.value)} />
              </Field>
              <Field label={t('customers.gpsLng')}>
                <Input type="number" step="0.000001" dir="ltr" className="max-w-[10rem]"
                  value={gpsLng} onChange={(e) => setGpsLng(e.target.value)} />
              </Field>
              <Button
                type="button" variant="secondary" disabled={pending}
                onClick={async () => {
                  const lat = parseFloat(gpsLat); const lng = parseFloat(gpsLng);
                  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return toast.error(t('workflow.toast.error'));
                  const policy = await loadActionPolicyConfig('customer.gpsChangeApproval');
                  if (!policy.enabled) { toast.error(t('actionPolicies.disabledForTenant')); return; }
                  void runCritical({
                    catalogKey: 'customer.gpsChangeApproval',
                    action: t('critical.actions.gpsChangeApproval'),
                    record: `${locale === 'ar' ? current.name_ar || current.name : current.name} · ${lat}, ${lng}`,
                    requireReason: policy.reasonRequired,
                    irreversible: policy.irreversible,
                    execute: async (reason) => {
                      const res = await requestCustomerGpsChange(current.id, lat, lng, reason);
                      return { ok: res.ok, error: res.error };
                    },
                    onDone: () => { setGpsLat(''); setGpsLng(''); router.refresh(); },
                  });
                }}
              >
                {t('customers.gpsRequestApproval')}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

/** Small labeled field wrapper — shared by CustomerForm and CustomersManager. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
export function HierarchyAccountSection({
  current,
  parentOptions,
  businessTypes,
  statusReasons,
  ar,
  t,
}: {
  current: ErpCustomer | null;
  parentOptions: ErpCustomer[];
  businessTypes: CustomerLookup[];
  statusReasons: CustomerLookup[];
  ar: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [accountType, setAccountType] = useState<string>(current?.customer_account_type ?? 'independent');
  const [status, setStatus] = useState<string>(current?.customer_status ?? 'active');
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
        <select name="customer_status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
          {CUSTOMER_STATUSES.map((o) => <option key={o.value} value={o.value}>{ar ? o.ar : o.en}</option>)}
        </select>
      </Field>
      {status !== 'active' && (
        <>
          <Field label={t('customers.fieldStatusReason')}>
            <select name="status_reason_id" defaultValue={current?.status_reason_id ?? ''} className={selectClass}>
              <option value="">{t('customers.optionNone')}</option>
              {statusReasons.map((l) => <option key={l.id} value={l.id}>{lkName(l)}</option>)}
            </select>
          </Field>
          <Field label={t('customers.fieldStatusReasonNote')}>
            <Input name="status_reason_note" defaultValue={current?.status_reason_note ?? ''} />
          </Field>
        </>
      )}
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
