'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Upload } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { ListSearch } from '@/components/list-search';
import { Pager } from '@/components/pager';
import { AdminWorkbench, useWorkbenchSelection } from '@/components/admin/admin-workbench';
import { DetailPlaceholder } from '@/components/admin/entity-detail';
import { ContextPanel, ContextSection, SummaryList, RelatedChips } from '@/components/admin/context-panel';
import { Customer360, type RouteRef } from './customer-360';
import { CustomerForm } from './customer-form';
import { ImportDialog } from './customer-import-dialog';
import { customerBadgeState, CUSTOMER_BADGE_VARIANT, CUSTOMER_BADGE_KEY } from './customer-360-tabs';
import { loadCustomerDetailBundleAction } from './customers-workbench-actions';
import type { CustomerDetailBundle } from './[id]/load';
import type { Area, Branch, CustomerLookup, CustomerLookupKind, ErpCustomer, Profile, Region } from '@/lib/erp/types';
import type { CustomFieldDef } from '@/lib/erp/custom-fields';
import type { GovInputs } from '@/lib/erp/field-governance';

type Rep = Pick<Profile, 'id' | 'full_name' | 'email'>;

/** Data-dense facets claim the full width (the right rail is dropped so the
 *  center spans everything) — operational efficiency over dashboard symmetry. */
const DENSE_TABS = new Set(['statement', 'activity', 'profile']);

export interface CustomersWorkbenchProps {
  customers: ErpCustomer[];
  /** Full record for the active ?id — keeps deep links robust across pagination. */
  selectedCustomer?: ErpCustomer | null;
  branches: Branch[];
  reps: Rep[];
  lookups: CustomerLookup[];
  regions: Region[];
  areas: Area[];
  routes?: RouteRef[];
  customFields: CustomFieldDef[];
  gov?: GovInputs;
  canApprove?: boolean;
  canCollect?: boolean;
  canTransfer?: boolean;
  canRequestCredit?: boolean;
  // Server list state (search · filters · pagination) — mirrors the old list.
  q?: string;
  filterSegment?: string;
  filterClassification?: string;
  filterChannel?: string;
  page?: number;
  pageSize?: number;
  total?: number;
}

/**
 * Customer Workbench — the canonical 3-panel customer experience: list (left) ·
 * Customer 360 (center, the primary focus) · compact summary context (right),
 * on the shared AdminWorkbench with operational `wide` proportions. The list is
 * server-driven (whole-table search · the 3 lookup filters · pagination), create
 * uses the shared CustomerForm, and import reuses the existing dialog. Reuse-only:
 * no business-logic / permission / RLS / workflow change.
 */
export function CustomersWorkbench({
  customers,
  selectedCustomer,
  branches,
  reps,
  lookups,
  regions,
  areas,
  routes = [],
  customFields,
  gov,
  canApprove = false,
  canCollect = false,
  canTransfer = false,
  canRequestCredit = false,
  q = '',
  filterSegment = '',
  filterClassification = '',
  filterChannel = '',
  page = 1,
  pageSize = 20,
  total = 0,
}: CustomersWorkbenchProps) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const router = useRouter();
  const { selectedId, tab, select, setTab } = useWorkbenchSelection('overview');
  const [bundle, setBundle] = useState<CustomerDetailBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadBundle = useCallback((id: string) => {
    setLoading(true);
    loadCustomerDetailBundleAction(id).then((res) => {
      setBundle(res.ok ? res.data : null);
      setLoading(false);
      if (!res.ok) toast.error(t('customers.toastError'));
    });
  }, [t]);

  useEffect(() => {
    if (!selectedId) { setBundle(null); return; }
    loadBundle(selectedId);
  }, [selectedId, loadBundle]);

  // Resolve the full record for the header/form/related: the server-provided
  // selectedCustomer (deep-link robust) wins, else the current list page.
  const selected = selectedCustomer && selectedCustomer.id === selectedId
    ? selectedCustomer
    : customers.find((c) => c.id === selectedId) ?? null;

  const list = (
    <CustomerListPanel
      customers={customers}
      lookups={lookups}
      selectedId={selectedId}
      tab={tab}
      onSelect={(id) => { setCreating(false); select(id); }}
      onNew={() => setCreating(true)}
      onImport={() => setImporting(true)}
      q={q}
      filterSegment={filterSegment}
      filterClassification={filterClassification}
      filterChannel={filterChannel}
      page={page}
      pageSize={pageSize}
      total={total}
    />
  );

  let detail: React.ReactNode;
  if (creating) {
    detail = (
      <CustomerForm
        customer={null}
        customers={customers}
        branches={branches}
        reps={reps}
        lookups={lookups}
        regions={regions}
        areas={areas}
        customFields={customFields}
        gov={gov}
        onSaved={() => { setCreating(false); router.refresh(); }}
        onCancel={() => setCreating(false)}
      />
    );
  } else if (!selectedId || !selected) {
    detail = <DetailPlaceholder text={!selectedId ? t('adminWb.selectPrompt') : '…'} />;
  } else if (loading || !bundle) {
    detail = <DetailPlaceholder text="…" />;
  } else {
    detail = (
      <Customer360
        customer={selected}
        bundle={bundle}
        customers={customers}
        branches={branches}
        reps={reps}
        lookups={lookups}
        regions={regions}
        areas={areas}
        routes={routes}
        customFields={customFields}
        gov={gov}
        canApprove={canApprove}
        canCollect={canCollect}
        canTransfer={canTransfer}
        canRequestCredit={canRequestCredit}
        tab={tab}
        onTabChange={setTab}
        onChanged={() => { if (selectedId) loadBundle(selectedId); router.refresh(); }}
      />
    );
  }

  // Compact, summary-oriented context — only on the non-dense facets (and not
  // while creating, which is a focused full-width form).
  const showContext = !creating && !!selected && !!bundle && !DENSE_TABS.has(tab);
  const context = showContext && bundle && selected ? (() => {
    const s = bundle.statement.statement.summary;
    const badge = customerBadgeState(selected);
    const branch = branches.find((b) => b.id === selected.branch_id);
    const rep = reps.find((r) => r.id === selected.salesman_id);
    const region = regions.find((r) => r.id === selected.region_id);
    const chips: { label: string; href?: string }[] = [];
    if (branch) chips.push({ label: branch.name_ar || branch.name });
    if (rep) chips.push({ label: rep.full_name || rep.email || '—' });
    if (region) chips.push({ label: ar ? region.name_ar || region.name : region.name });
    return (
      <ContextPanel>
        <ContextSection title={t('adminWb.summary')}>
          <SummaryList rows={[
            { label: t('customer360.statBalance'), value: <span dir="ltr">{formatCurrency(s.currentBalance)}</span> },
            { label: t('customer360.statCreditLimit'), value: <span dir="ltr">{formatCurrency(s.creditLimit)}</span> },
            { label: t('customer360.statOverdue'), value: <span dir="ltr">{formatCurrency(s.overdueAmount)}</span> },
            { label: t('customer360.statInvoices'), value: <span dir="ltr">{s.openInvoiceCount}</span> },
            { label: t('customer360.statStatus'), value: <Badge variant={CUSTOMER_BADGE_VARIANT[badge]}>{t(CUSTOMER_BADGE_KEY[badge])}</Badge> },
          ]} />
        </ContextSection>
        {chips.length > 0 && (
          <ContextSection title={t('customer360.relatedTitle')}>
            <RelatedChips items={chips} />
          </ContextSection>
        )}
      </ContextPanel>
    );
  })() : undefined;

  return (
    <>
      <AdminWorkbench
        layout="wide"
        list={list}
        detail={detail}
        context={context}
        contextLabel={t('adminWb.contextLabel')}
      />
      {importing && (
        <ImportDialog
          branches={branches}
          reps={reps}
          onClose={() => setImporting(false)}
          onDone={() => { setImporting(false); router.refresh(); }}
        />
      )}
    </>
  );
}

/** Left panel — server-driven list (whole-table search · 3 lookup filters ·
 *  pagination), plus New / Import and a current-page receivable total. */
function CustomerListPanel({
  customers,
  lookups,
  selectedId,
  tab,
  onSelect,
  onNew,
  onImport,
  q,
  filterSegment,
  filterClassification,
  filterChannel,
  page,
  pageSize,
  total,
}: {
  customers: ErpCustomer[];
  lookups: CustomerLookup[];
  selectedId: string | null;
  tab: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onImport: () => void;
  q: string;
  filterSegment: string;
  filterClassification: string;
  filterChannel: string;
  page: number;
  pageSize: number;
  total: number;
}) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const byKind = (kind: CustomerLookupKind) => lookups.filter((l) => l.kind === kind);
  const segments = byKind('segment');
  const classes = byKind('classification');
  const channels = byKind('channel');
  const totalReceivable = customers.reduce((s, x) => s + Number(x.balance || 0), 0);

  // Server-driven filter: update the URL param (reset page) → server re-queries
  // the whole table (preserves the selection ?id=&tab=).
  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const selectCls = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Button size="sm" className="flex-1" onClick={onNew}><Plus className="h-4 w-4" /> {t('customers.btnNew')}</Button>
          <Button size="sm" variant="outline" onClick={onImport}><Upload className="h-4 w-4" /> {t('customers.btnImport')}</Button>
        </div>
        <Badge variant="secondary" className="w-full justify-center text-xs">
          {t('customers.totalReceivable')}: <span dir="ltr" className="ms-1">{formatCurrency(totalReceivable)}</span>
        </Badge>
        <ListSearch placeholder={t('customers.searchPlaceholder')} className="w-full" />
        {segments.length > 0 && (
          <select value={filterSegment} onChange={(e) => setParam('segment', e.target.value)} className={selectCls}>
            <option value="">{t('customers.filterAllSegments')}</option>
            {segments.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
          </select>
        )}
        {classes.length > 0 && (
          <select value={filterClassification} onChange={(e) => setParam('classification', e.target.value)} className={selectCls}>
            <option value="">{t('customers.filterAllClasses')}</option>
            {classes.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
          </select>
        )}
        {channels.length > 0 && (
          <select value={filterChannel} onChange={(e) => setParam('channel', e.target.value)} className={selectCls}>
            <option value="">{t('customers.filterAllChannels')}</option>
            {channels.map((l) => <option key={l.id} value={l.id}>{ar ? l.name_ar || l.name : l.name}</option>)}
          </select>
        )}
        <div className="max-h-[26rem] space-y-1 overflow-auto" role="listbox">
          {customers.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {q || filterSegment || filterClassification || filterChannel ? t('customers.emptyNoResults') : t('customers.emptyNoCustomers')}
            </p>
          ) : (
            customers.map((c) => {
              const badge = customerBadgeState(c);
              return (
                <button
                  key={c.id}
                  role="option"
                  aria-selected={selectedId === c.id}
                  onClick={() => onSelect(c.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm ${
                    selectedId === c.id ? 'bg-secondary font-medium' : 'hover:bg-secondary'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{c.name_ar || c.name}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground" dir="ltr">{c.code}</span>
                  </span>
                  <Badge variant={CUSTOMER_BADGE_VARIANT[badge]} className="shrink-0 text-[10px]">{t(CUSTOMER_BADGE_KEY[badge])}</Badge>
                </button>
              );
            })
          )}
        </div>
        <Pager
          page={page}
          pageSize={pageSize}
          total={total}
          basePath={pathname}
          query={{
            q: q || undefined,
            segment: filterSegment || undefined,
            classification: filterClassification || undefined,
            channel: filterChannel || undefined,
            id: selectedId || undefined,
            tab: selectedId ? tab : undefined,
          }}
        />
      </CardContent>
    </Card>
  );
}
