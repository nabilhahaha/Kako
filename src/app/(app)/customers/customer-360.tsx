'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Wallet,
  CreditCard,
  AlertTriangle,
  Receipt,
  MapPin,
  Inbox,
  BadgeCheck,
  Power,
  Printer,
  ArrowRightLeft,
  Boxes,
  FileText,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { useCriticalAction } from '@/lib/critical-action';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { CUSTOMER_STATUSES } from '@/lib/erp/constants';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { QuickNav, type QuickLink } from '@/components/home/home-widgets';
import { ActivityTimeline } from '@/components/home/activity-timeline';
import { CustomerStatementView } from '@/components/customers/customer-statement';
import { EntityNotes } from '@/components/entity/entity-notes';
import { EntityHeader, EntityTabs } from '@/components/admin/entity-detail';
import { SectionCard } from '@/components/admin/section-card';
import { EntityActionBar } from '@/components/admin/entity-action-bar';
import { RelatedChips } from '@/components/admin/context-panel';
import { ActivityFeed } from '@/components/admin/activity-feed';
import { CustomerForm } from './customer-form';
import { toggleCustomerActive, approveCustomer, rejectCustomer } from './actions';
import {
  CUSTOMER_360_TAB_KEYS,
  customerBadgeState,
  customerNeedsDecision,
  type CustomerBadgeState,
} from './customer-360-tabs';
import type { CustomerDetailBundle } from './[id]/load';
import type { Area, Branch, CustomerLookup, ErpCustomer, Profile, Region } from '@/lib/erp/types';
import type { CustomFieldDef } from '@/lib/erp/custom-fields';
import type { GovInputs } from '@/lib/erp/field-governance';

type Rep = Pick<Profile, 'id' | 'full_name' | 'email'>;

const BADGE_VARIANT: Record<CustomerBadgeState, 'secondary' | 'warning' | 'destructive' | 'success'> = {
  draft: 'secondary',
  pending: 'warning',
  rejected: 'destructive',
  active: 'success',
  inactive: 'destructive',
};
const BADGE_KEY: Record<CustomerBadgeState, string> = {
  draft: 'customers.statusDraft',
  pending: 'customers.statusPending',
  rejected: 'customers.statusRejected',
  active: 'customers.statusActive',
  inactive: 'customers.statusInactive',
};

export interface Customer360Props {
  /** Full record (from the workbench list selection) — header, form, related. */
  customer: ErpCustomer;
  /** Lazily-loaded detail bundle (statement · activity · merged 360 timeline). */
  bundle: CustomerDetailBundle;
  // Form-support data (Profile tab → CustomerForm), reused verbatim.
  customers: ErpCustomer[];
  branches: Branch[];
  reps: Rep[];
  lookups: CustomerLookup[];
  regions: Region[];
  areas: Area[];
  customFields: CustomFieldDef[];
  gov?: GovInputs;
  // Reused permission gates (enforced server-side; here they only gate the UI).
  canApprove?: boolean;
  canCollect?: boolean;
  canTransfer?: boolean;
  /** URL-addressable facet tab, controlled by the workbench (?tab=). */
  tab: string;
  onTabChange: (tab: string) => void;
  /** Called after a successful mutation so the workbench can refresh. */
  onChanged?: () => void;
}

/**
 * Customer 360 — the canonical tabbed customer detail for the Customer Workbench,
 * mirroring the Companies/Users pattern (EntityHeader + EntityTabs + SectionCards).
 * Pure composition: every tab reuses an existing component/loader/action — the
 * statement (CustomerStatementView), the unified activity timeline (financial +
 * customer requests + visit outcomes, from loadCustomerDetailBundle), the edit
 * form (the shared CustomerForm), notes (EntityNotes) and audit (ActivityFeed).
 * No business-logic, permission, RLS, or workflow change; no new actions.
 */
export function Customer360({
  customer,
  bundle,
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
  tab,
  onTabChange,
  onChanged,
}: Customer360Props) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const router = useRouter();
  const runCritical = useCriticalAction();
  const [pending, start] = useTransition();

  const id = customer.id;
  const name = customer.name_ar || customer.name;
  const badge = customerBadgeState(customer);
  const needsDecision = customerNeedsDecision(customer);
  const refresh = () => { onChanged?.(); router.refresh(); };

  const { summary } = bundle.statement.statement;
  const printHref = `/print/statement/${id}`;

  // ── Reused actions (same server actions as the list) ───────────────────────
  function onApprove() {
    start(async () => {
      const res = await approveCustomer(id);
      if (!res.ok) toast.error(res.error ?? t('customers.toastError'));
      else { toast.success(t('customers.toastApproved')); refresh(); }
    });
  }
  function onReject() {
    const reason = window.prompt(t('customers.rejectReasonPrompt'));
    if (!reason || !reason.trim()) return;
    start(async () => {
      const res = await rejectCustomer(id, reason.trim());
      if (!res.ok) toast.error(res.error ?? t('customers.toastError'));
      else { toast.success(t('customers.toastUpdated')); refresh(); }
    });
  }
  function onToggle() {
    void runCritical({
      catalogKey: 'customer.statusChange',
      action: t('critical.actions.customerStatusChange'),
      record: name,
      execute: async (reason) => {
        const res = await toggleCustomerActive(id, !customer.is_active, reason);
        return { ok: res.ok, error: res.error };
      },
      onDone: refresh,
    });
  }

  const tabLabels: Record<(typeof CUSTOMER_360_TAB_KEYS)[number], string> = {
    overview: t('customer360.tabOverview'),
    profile: t('customer360.tabProfile'),
    statement: t('customer360.tabStatement'),
    activity: t('customer360.tabActivity'),
    related: t('customer360.tabRelated'),
    audit: t('customer360.tabAudit'),
  };

  return (
    <div>
      <EntityHeader
        title={name}
        subtitle={customer.code ? `${customer.code}${customer.phone ? ` · ${customer.phone}` : ''}` : customer.phone ?? undefined}
        status={<Badge variant={BADGE_VARIANT[badge]}>{t(BADGE_KEY[badge])}</Badge>}
        actions={
          <EntityActionBar
            actions={[
              {
                key: 'approve',
                label: t('customers.btnApprove'),
                icon: <BadgeCheck className="h-4 w-4" />,
                run: onApprove,
                hidden: !canApprove || !needsDecision,
                disabled: pending,
              },
              {
                key: 'reject',
                label: t('customers.btnReject'),
                run: onReject,
                hidden: !canApprove || !needsDecision,
                disabled: pending,
                destructive: true,
                overflow: true,
              },
              {
                key: 'toggle',
                label: customer.is_active ? t('customers.btnDeactivate') : t('customers.btnActivate'),
                icon: <Power className="h-4 w-4" />,
                run: onToggle,
                disabled: pending,
                destructive: !!customer.is_active,
              },
              {
                key: 'print',
                label: t('customers.stmtBtnPrint'),
                icon: <Printer className="h-4 w-4" />,
                run: () => window.open(printHref, '_blank'),
                overflow: true,
              },
              {
                key: 'transfer',
                label: t('transferReq.customerTitle'),
                icon: <ArrowRightLeft className="h-4 w-4" />,
                run: () => router.push('/customers/transfer'),
                hidden: !canTransfer,
                overflow: true,
              },
            ]}
          />
        }
      />

      <EntityTabs
        active={tab}
        onChange={onTabChange}
        tabs={CUSTOMER_360_TAB_KEYS.map((k) => ({ key: k, label: tabLabels[k] }))}
      />

      {/* ── Overview ──────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t('customer360.statBalance')} value={formatCurrency(summary.currentBalance)} icon={Wallet} tone={summary.currentBalance > 0 ? 'warning' : 'success'} />
            <StatCard label={t('customer360.statCreditLimit')} value={formatCurrency(summary.creditLimit)} icon={CreditCard} tone="info" />
            <StatCard label={t('customer360.statOverdue')} value={formatCurrency(summary.overdueAmount)} icon={AlertTriangle} tone={summary.overdueAmount > 0 ? 'destructive' : 'success'} />
            <StatCard label={t('customer360.statInvoices')} value={String(summary.openInvoiceCount)} icon={Receipt} tone="primary" />
          </div>
          <SectionCard title={t('customer360.identity')}>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <Row label={t('customers.fieldCode')} value={customer.code} ltr />
              <Row label={t('customers.fieldPhone')} value={customer.phone} ltr />
              <Row label={t('customers.fieldEmail')} value={customer.email} ltr />
              <Row label={t('customers.fieldCity')} value={customer.city} />
              <Row label={t('customers.fieldAddress')} value={customer.address} />
              <Row label={t('customer360.relBranch')} value={branchName(customer.branch_id, branches)} />
            </dl>
          </SectionCard>
          <SectionCard title={t('customer360.quickActions')}>
            <QuickNav links={[
              { label: t('salesman.actNewInvoice'), href: '/sales/invoices', icon: Receipt },
              { label: t('salesman.actPrintStatement'), href: printHref, icon: FileText },
              { label: t('salesman.actStock'), href: '/inventory', icon: Boxes },
            ] satisfies QuickLink[]} />
          </SectionCard>
        </div>
      )}

      {/* ── Profile (the shared edit form) ────────────────────────────────── */}
      {tab === 'profile' && (
        <CustomerForm
          customer={customer}
          customers={customers}
          branches={branches}
          reps={reps}
          lookups={lookups}
          regions={regions}
          areas={areas}
          customFields={customFields}
          gov={gov}
          onSaved={refresh}
          onCancel={() => onTabChange('overview')}
        />
      )}

      {/* ── Statement (verbatim) ──────────────────────────────────────────── */}
      {tab === 'statement' && (
        <div className="space-y-4">
          <StatusContext customer={customer} lookups={lookups} reps={reps} ar={ar} locale={locale} t={t} />
          <CustomerStatementView
            statement={bundle.statement.statement}
            printHref={printHref}
            collectHref="/collections"
            canCollect={canCollect}
            showRecon
          />
          <SectionCard title={t('customer360.notesTitle')}>
            <EntityNotes entity="customer" recordId={id} />
          </SectionCard>
        </div>
      )}

      {/* ── Activity (richer: financial + requests + visits) ──────────────── */}
      {tab === 'activity' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t('customer360.statBalance')} value={formatCurrency(bundle.activity.balance)} icon={Wallet} tone={bundle.activity.balance > 0 ? 'warning' : 'success'} />
            <StatCard label={t('customer360.statInvoices')} value={String(bundle.activity.invoiceCount)} icon={Receipt} tone="info" />
            <StatCard label={t('customer360.statRequests')} value={String(bundle.requestCount)} icon={Inbox} tone="primary" />
            <StatCard label={t('customer360.statVisits')} value={String(bundle.visitCount)} icon={MapPin} tone="primary" />
          </div>
          <SectionCard title={t('customer360.activityTitle')} description={t('customer360.activityScope')}>
            <ActivityTimeline events={bundle.timeline} emptyTitle={t('customer360.activityEmpty')} />
          </SectionCard>
        </div>
      )}

      {/* ── Related ───────────────────────────────────────────────────────── */}
      {tab === 'related' && (
        <RelatedTab customer={customer} customers={customers} branches={branches} reps={reps} regions={regions} areas={areas} ar={ar} t={t} />
      )}

      {/* ── Audit ─────────────────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <SectionCard title={t('customer360.auditTitle')}>
          <ActivityFeed entityId={id} entities={['customer']} />
        </SectionCard>
      )}
    </div>
  );
}

function Row({ label, value, ltr }: { label: string; value?: string | null; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b py-1 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-end font-medium" dir={ltr ? 'ltr' : undefined}>{value || '—'}</dd>
    </div>
  );
}

function branchName(id: string | null, branches: Branch[]): string {
  if (!id) return '—';
  const b = branches.find((x) => x.id === id);
  return b ? b.name_ar || b.name : '—';
}

/** Account-status context — same data the statement page surfaced (status badge,
 *  reason, last change), resolved from the already-loaded lookups/reps. */
function StatusContext({
  customer, lookups, reps, ar, locale, t,
}: {
  customer: ErpCustomer; lookups: CustomerLookup[]; reps: Rep[]; ar: boolean;
  locale: 'ar' | 'en'; t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const statusLabel = CUSTOMER_STATUSES.find((s) => s.value === customer.customer_status)?.[locale] ?? customer.customer_status ?? '';
  const tone = customer.customer_status === 'active' ? 'success' : customer.customer_status === 'blocked' ? 'destructive' : 'warning';
  const reason = lookups.find((l) => l.id === customer.status_reason_id);
  const reasonName = reason ? (ar ? reason.name_ar || reason.name : reason.name) : '';
  const changedBy = reps.find((r) => r.id === customer.status_changed_by);
  const changedByName = changedBy?.full_name || changedBy?.email || '';
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3 text-sm ${customer.customer_status !== 'active' ? 'border-warning/40 bg-warning/5' : ''}`}>
      <span className="flex items-center gap-2">
        <span className="text-muted-foreground">{t('customers.statusLabel')}:</span>
        <Badge variant={tone}>{statusLabel}</Badge>
      </span>
      {reasonName && (
        <span><span className="text-muted-foreground">{t('customers.fieldStatusReason')}:</span> {reasonName}{customer.status_reason_note ? ` — ${customer.status_reason_note}` : ''}</span>
      )}
      {customer.status_changed_at && (
        <span className="text-muted-foreground">
          {t('customers.statusSinceLabel')}: <span dir="ltr">{new Date(customer.status_changed_at).toLocaleDateString()}</span>
          {changedByName ? ` · ${changedByName}` : ''}
        </span>
      )}
      {customer.customer_status !== 'active' && (
        <span className="text-xs text-muted-foreground">{t('customers.statusCollectionsNote')}</span>
      )}
    </div>
  );
}

/** Related records as deep-linking chips (branch · salesman · region · area ·
 *  parent · sub-accounts). Parent/children deep-link into the workbench by id. */
function RelatedTab({
  customer, customers, branches, reps, regions, areas, ar, t,
}: {
  customer: ErpCustomer; customers: ErpCustomer[]; branches: Branch[]; reps: Rep[];
  regions: Region[]; areas: Area[]; ar: boolean;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const lk = (n: { name: string; name_ar: string | null } | undefined) => (n ? (ar ? n.name_ar || n.name : n.name) : '');
  const branch = branches.find((b) => b.id === customer.branch_id);
  const rep = reps.find((r) => r.id === customer.salesman_id);
  const region = regions.find((r) => r.id === customer.region_id);
  const area = areas.find((a) => a.id === customer.area_id);
  const parent = customers.find((c) => c.id === customer.parent_customer_id);
  const children = customers.filter((c) => c.parent_customer_id === customer.id);

  const sections: { title: string; items: { label: string; href?: string }[] }[] = [];
  if (branch) sections.push({ title: t('customer360.relBranch'), items: [{ label: branch.name_ar || branch.name, href: '/settings/branches' }] });
  if (rep) sections.push({ title: t('customer360.relSalesman'), items: [{ label: rep.full_name || rep.email || '—' }] });
  if (region) sections.push({ title: t('customer360.relRegion'), items: [{ label: lk(region) }] });
  if (area) sections.push({ title: t('customer360.relArea'), items: [{ label: lk(area) }] });
  if (parent) sections.push({ title: t('customer360.relParent'), items: [{ label: parent.name_ar || parent.name, href: `/customers?id=${parent.id}` }] });
  if (children.length) sections.push({ title: t('customer360.relChildren'), items: children.map((c) => ({ label: c.name_ar || c.name, href: `/customers?id=${c.id}` })) });

  return (
    <SectionCard title={t('customer360.relatedTitle')}>
      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('customer360.relNone')}</p>
      ) : (
        <div className="space-y-3">
          {sections.map((s) => (
            <div key={s.title} className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.title}</p>
              <RelatedChips items={s.items} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
