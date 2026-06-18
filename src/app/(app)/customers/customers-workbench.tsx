'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { AdminWorkbench, useWorkbenchSelection } from '@/components/admin/admin-workbench';
import { EntityListPanel } from '@/components/admin/entity-list-panel';
import { DetailPlaceholder } from '@/components/admin/entity-detail';
import { ContextPanel, ContextSection, SummaryList, RelatedChips } from '@/components/admin/context-panel';
import { Customer360 } from './customer-360';
import { customerBadgeState, CUSTOMER_BADGE_VARIANT, CUSTOMER_BADGE_KEY } from './customer-360-tabs';
import { loadCustomerDetailBundleAction } from './customers-workbench-actions';
import type { CustomerDetailBundle } from './[id]/load';
import type { Area, Branch, CustomerLookup, ErpCustomer, Profile, Region } from '@/lib/erp/types';
import type { CustomFieldDef } from '@/lib/erp/custom-fields';
import type { GovInputs } from '@/lib/erp/field-governance';

type Rep = Pick<Profile, 'id' | 'full_name' | 'email'>;

/** Data-dense facets claim the full width (the right rail is dropped so the
 *  center spans everything) — operational efficiency over dashboard symmetry. */
const DENSE_TABS = new Set(['statement', 'activity', 'profile']);

export interface CustomersWorkbenchProps {
  customers: ErpCustomer[];
  branches: Branch[];
  reps: Rep[];
  lookups: CustomerLookup[];
  regions: Region[];
  areas: Area[];
  customFields: CustomFieldDef[];
  gov?: GovInputs;
  canApprove?: boolean;
  canCollect?: boolean;
  canTransfer?: boolean;
}

/**
 * Customer Workbench — the canonical 3-panel customer experience: list (left) ·
 * Customer 360 (center, the primary focus) · compact summary context (right),
 * on the shared AdminWorkbench with operational `wide` proportions. Reuse-only:
 * Customer360 + the existing actions/loaders/permissions. No business-logic /
 * permission / RLS / workflow change. The /customers page is rewired onto this
 * (with deep-link redirects) in P5-4.
 */
export function CustomersWorkbench({
  customers,
  branches,
  reps,
  lookups,
  regions,
  areas,
  customFields,
  gov,
  canApprove = false,
  canCollect = false,
  canTransfer = false,
}: CustomersWorkbenchProps) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const router = useRouter();
  const { selectedId, tab, select, setTab } = useWorkbenchSelection('overview');
  const [bundle, setBundle] = useState<CustomerDetailBundle | null>(null);
  const [loading, setLoading] = useState(false);

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

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  const list = (
    <EntityListPanel
      items={customers.map((c) => ({
        id: c.id,
        primary: c.name_ar || c.name,
        secondary: c.code ?? undefined,
        search: `${c.code ?? ''} ${c.name} ${c.name_ar ?? ''} ${c.phone ?? ''}`,
      }))}
      selectedId={selectedId}
      onSelect={select}
      searchPlaceholder={t('customers.searchPlaceholder')}
      emptyText={t('customers.emptyNoCustomers')}
    />
  );

  if (!selected) {
    return <AdminWorkbench layout="wide" list={list} detail={<DetailPlaceholder text={t('adminWb.selectPrompt')} />} />;
  }

  const detail = loading || !bundle ? (
    <DetailPlaceholder text="…" />
  ) : (
    <Customer360
      customer={selected}
      bundle={bundle}
      customers={customers}
      branches={branches}
      reps={reps}
      lookups={lookups}
      regions={regions}
      areas={areas}
      customFields={customFields}
      gov={gov}
      canApprove={canApprove}
      canCollect={canCollect}
      canTransfer={canTransfer}
      tab={tab}
      onTabChange={setTab}
      onChanged={() => { if (selectedId) loadBundle(selectedId); router.refresh(); }}
    />
  );

  // Compact, summary-oriented context (shown only on the non-dense facets).
  const context = bundle ? (() => {
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
    <AdminWorkbench
      layout="wide"
      list={list}
      detail={detail}
      context={DENSE_TABS.has(tab) ? undefined : context}
      contextLabel={t('adminWb.contextLabel')}
    />
  );
}
