'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ListSearch } from '@/components/list-search';
import { toggleCustomerActive } from './actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCurrency } from '@/lib/utils';
import { importCustomers, approveCustomer, rejectCustomer } from './actions';
import { CustomerForm, Field } from './customer-form';
import type { Area, Branch, CustomerLookup, CustomerLookupKind, ErpCustomer, Profile, Region } from '@/lib/erp/types';
import type { CustomFieldDef } from '@/lib/erp/custom-fields';
import type { GovInputs } from '@/lib/erp/field-governance';
import Link from 'next/link';
import { Plus, Pencil, Loader2, X, Users, Search, AlertTriangle, FileText, Upload, Printer, BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { useCriticalAction } from '@/lib/critical-action';

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
  gov,
  q = '',
  filterSegment = '',
  filterClassification = '',
  filterChannel = '',
}: {
  customers: ErpCustomer[];
  branches: Branch[];
  reps: Rep[];
  lookups?: CustomerLookup[];
  regions?: Region[];
  areas?: Area[];
  canApprove?: boolean;
  customFields?: CustomFieldDef[];
  gov?: GovInputs;
  q?: string;
  filterSegment?: string;
  filterClassification?: string;
  filterChannel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const runCritical = useCriticalAction();
  const [editing, setEditing] = useState<ErpCustomer | null | 'new'>(null);
  const [importing, setImporting] = useState(false);
  const [pending, startTransition] = useTransition();

  const ar = locale === 'ar';
  const byKind = (kind: CustomerLookupKind) => lookups.filter((l) => l.kind === kind);
  const segments = byKind('segment');
  const classes = byKind('classification');
  const channels = byKind('channel');
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

  // Server-driven filters: update the URL param (resets page) → server re-queries
  // across the whole table, not just the current page.
  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  // Customer activation/deactivation — reason mandatory (catalog: customer.statusChange).
  function onToggle(c: ErpCustomer) {
    void runCritical({
      catalogKey: 'customer.statusChange',
      action: t('critical.actions.customerStatusChange'),
      record: locale === 'ar' ? c.name_ar || c.name : c.name,
      execute: async (reason) => {
        const res = await toggleCustomerActive(c.id, !c.is_active, reason);
        return { ok: res.ok, error: res.error };
      },
      onDone: () => router.refresh(),
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
          <select value={filterSegment} onChange={(e) => setParam('segment', e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">{t('customers.filterAllSegments')}</option>
            {segments.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
          </select>
        )}
        {classes.length > 0 && (
          <select value={filterClassification} onChange={(e) => setParam('classification', e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">{t('customers.filterAllClasses')}</option>
            {classes.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
          </select>
        )}
        {channels.length > 0 && (
          <select value={filterChannel} onChange={(e) => setParam('channel', e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">{t('customers.filterAllChannels')}</option>
            {channels.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
          </select>
        )}
        <ListSearch placeholder={t('customers.searchPlaceholder')} className="w-full sm:ms-auto sm:w-64" />
      </div>

      {editing !== null && (
        <CustomerForm
          customer={current}
          customers={customers}
          branches={branches}
          reps={reps}
          lookups={lookups}
          regions={regions}
          areas={areas}
          customFields={customFields}
          gov={gov}
          onSaved={() => { setEditing(null); router.refresh(); }}
          onCancel={() => setEditing(null)}
        />
      )}

      {customers.length === 0 ? (
        (q || filterSegment || filterClassification || filterChannel) ? (
          <EmptyState icon={<Search />} title={t('customers.emptyNoResults')} />
        ) : (
          <EmptyState
            icon={<Users />}
            title={t('customers.emptyNoCustomers')}
            description={t('customers.emptyNoCustomersHint')}
            action={editing === null ? (
              <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> {t('customers.btnNew')}</Button>
            ) : undefined}
          />
        )
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Mobile (UX-3): cards instead of a wide horizontal-scroll table */}
            <div className="divide-y sm:hidden">
              {customers.map((c) => {
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
                  {customers.map((c) => {
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

