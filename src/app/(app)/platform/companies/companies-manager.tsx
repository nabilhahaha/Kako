'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import {
  Loader2,
  Plus,
  Settings2,
  Power,
  Building2,
  SearchX,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import type { Company } from '@/lib/erp/types';
import {
  BUSINESS_TYPE_LABELS,
  BUSINESS_TYPES,
  daysLeft,
  subscriptionState,
  type SubscriptionState,
} from '@/lib/erp/subscription';
import { ALL_MODULES, MODULE_LABELS, type Module } from '@/lib/erp/navigation';
import { buildQuery } from '@/lib/list-params';
import { createCompany, setCompanyActive } from './actions';
import { useI18n } from '@/lib/i18n/provider';

export interface CompanyRow {
  company: Company;
  branches: number;
  users: number;
}

type StateBadgeVariant = 'success' | 'warning' | 'destructive' | 'secondary' | 'info';

const STATE_BADGE_VARIANT: Record<SubscriptionState, StateBadgeVariant> = {
  active:    'success',
  expiring:  'warning',
  expired:   'destructive',
  suspended: 'destructive',
  trial:     'info',
  open:      'info',
};

/** Subtle left-accent border so urgent rows stand out at a glance. */
const STATE_ACCENT: Partial<Record<SubscriptionState, string>> = {
  expiring: 'border-s-2 border-s-warning',
  expired: 'border-s-2 border-s-destructive',
  suspended: 'border-s-2 border-s-destructive',
};

/** Server-expressible sorts only. Branch/user counts are derived per-page and
 *  cannot be sorted server-side cheaply, so those columns keep their values but
 *  are not sortable here (see report). */
type SortKey = 'name' | 'expiry' | 'created';
type StatusFilter = 'all' | SubscriptionState;
type Dir = 'asc' | 'desc';

export interface CompanyListFilters {
  q: string;
  status: StatusFilter;
  sort: SortKey;
  dir: Dir;
}

const STATUS_FILTERS: SubscriptionState[] = ['active', 'expiring', 'expired', 'suspended', 'trial'];

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function CompaniesManager({
  rows,
  total,
  page,
  pageSize,
  filters,
  btDefaults,
  btRoles,
  roleLabels,
}: {
  rows: CompanyRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: CompanyListFilters;
  btDefaults: Record<string, string[]>;
  btRoles: Record<string, string[]>;
  roleLabels: Record<string, string>;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [navPending, startNav] = useTransition();

  // Quick-action deep-link: /platform/companies?new=1 auto-opens the existing
  // create form (read-only trigger of client UI; no write occurs on its own).
  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (didAutoOpen.current) return;
    if (searchParams?.get('new') === '1') {
      didAutoOpen.current = true;
      setShowForm(true);
    }
  }, [searchParams]);

  const [pending, startTransition] = useTransition();
  const [businessType, setBusinessType] = useState('general');
  const defaultsFor = (bt: string) => new Set<string>((btDefaults[bt] ?? []).filter((m) => (ALL_MODULES as string[]).includes(m)));
  const [modules, setModules] = useState<Set<string>>(() => defaultsFor('general'));
  const [roles, setRoles] = useState<Set<string>>(() => new Set(btRoles['general'] ?? []));

  // ── URL-persisted list controls ────────────────────────────────────
  // The search box keeps local state for responsive typing; URL is updated
  // (debounced) so the view stays shareable / refresh-safe.
  const [searchInput, setSearchInput] = useState(filters.q);
  useEffect(() => setSearchInput(filters.q), [filters.q]);

  /** Push new list params, preserving the create-form deep-link if open. */
  function pushParams(next: Partial<CompanyListFilters & { page: number }>) {
    const merged = {
      q: filters.q,
      status: filters.status,
      sort: filters.sort,
      dir: filters.dir,
      page,
      ...next,
    };
    const query = buildQuery({
      q: merged.q || undefined,
      status: merged.status === 'all' ? undefined : merged.status,
      sort: merged.sort === 'name' ? undefined : merged.sort,
      dir: merged.dir === 'asc' ? undefined : merged.dir,
      page: merged.page > 1 ? merged.page : undefined,
    });
    startNav(() => router.push(`${pathname}${query}`));
  }

  // Debounce search → URL (~300ms). Skip while equal to current URL value.
  useEffect(() => {
    if (searchInput === filters.q) return;
    const id = window.setTimeout(() => {
      pushParams({ q: searchInput, page: 1 });
    }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function onBusinessType(bt: string) {
    setBusinessType(bt);
    setModules(defaultsFor(bt)); // reset module + role selection to the type's defaults
    setRoles(new Set(btRoles[bt] ?? []));
  }
  function toggleModule(m: Module, on: boolean) {
    setModules((prev) => { const next = new Set(prev); if (on) next.add(m); else next.delete(m); return next; });
  }
  function toggleRole(r: string, on: boolean) {
    setRoles((prev) => { const next = new Set(prev); if (on) next.add(r); else next.delete(r); return next; });
  }
  const templateRoles = btRoles[businessType] ?? [];

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const res = await createCompany(formData);
      if (!res.ok) {
        toast.error(res.error ?? t('platform.companies.toastError'));
        return;
      }
      toast.success(t('platform.companies.toastCreated'));
      form.reset();
      setShowForm(false);
      router.refresh();
    });
  }

  function onToggleActive(id: string, next: boolean) {
    startTransition(async () => {
      const res = await setCompanyActive(id, next);
      if (!res.ok) {
        toast.error(res.error ?? t('platform.companies.toastError'));
        return;
      }
      toast.success(next ? t('platform.companies.toastActivated') : t('platform.companies.toastSuspended'));
      router.refresh();
    });
  }

  function onSort(key: SortKey) {
    const nextDir: Dir = key === filters.sort && filters.dir === 'asc' ? 'desc' : 'asc';
    pushParams({ sort: key, dir: nextDir, page: 1 });
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    const active = filters.sort === k;
    return (
      <th className="p-3 font-medium">
        <button
          type="button"
          onClick={() => onSort(k)}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          {label}
          {active &&
            (filters.dir === 'asc' ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            ))}
        </button>
      </th>
    );
  }

  const newButton = (
    <Button onClick={() => setShowForm((s) => !s)} variant={showForm ? 'secondary' : 'default'}>
      <Plus className="h-4 w-4" />
      {t('platform.companies.newCompany')}
    </Button>
  );

  // No-data (no companies at all and no active filter) vs no-results (filtered).
  const hasFilter = !!filters.q || filters.status !== 'all';
  const noData = total === 0 && !hasFilter;

  return (
    <div className="space-y-6">
      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={onCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name_ar">{t('platform.companies.form.nameArLabel')}</Label>
                  <Input id="name_ar" name="name_ar" placeholder={t('platform.companies.form.nameArPlaceholder')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">{t('platform.companies.form.nameLabel')}</Label>
                  <Input id="name" name="name" required placeholder={t('platform.companies.form.namePlaceholder')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">{t('platform.companies.form.slugLabel')}</Label>
                  <Input id="slug" name="slug" dir="ltr" placeholder={t('platform.companies.form.slugPlaceholder')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business_type">{t('platform.companies.form.businessTypeLabel')}</Label>
                  <select id="business_type" name="business_type" className={selectCls} value={businessType} onChange={(e) => onBusinessType(e.target.value)}>
                    {BUSINESS_TYPES.map((t_) => (
                      <option key={t_} value={t_}>
                        {BUSINESS_TYPE_LABELS[t_][locale]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subscription_start">{t('platform.companies.form.subscriptionStartLabel')}</Label>
                  <Input id="subscription_start" name="subscription_start" type="date" dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subscription_end">{t('platform.companies.form.subscriptionEndLabel')}</Label>
                  <Input id="subscription_end" name="subscription_end" type="date" dir="ltr" />
                </div>
              </div>
              <div className="space-y-2 rounded-md border bg-secondary/20 p-3">
                <Label>{t('platform.companies.form.modulesTitle')}</Label>
                <p className="text-xs text-muted-foreground">{t('platform.companies.form.modulesHint')}</p>
                <input type="hidden" name="_modules" value="1" />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ALL_MODULES.map((m) => (
                    <label key={m} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="modules" value={m} checked={modules.has(m)} onChange={(e) => toggleModule(m, e.target.checked)} className="h-4 w-4" />
                      {MODULE_LABELS[m][locale]}
                    </label>
                  ))}
                </div>
              </div>

              {templateRoles.length > 0 && (
                <div className="space-y-2 rounded-md border bg-secondary/20 p-3">
                  <Label>{t('platform.companies.form.rolesTitle')}</Label>
                  <p className="text-xs text-muted-foreground">{t('platform.companies.form.rolesHint')}</p>
                  <input type="hidden" name="_roles" value="1" />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {templateRoles.map((r) => (
                      <label key={r} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="roles" value={r} checked={roles.has(r)} onChange={(e) => toggleRole(r, e.target.checked)} className="h-4 w-4" />
                        {roleLabels[r] ?? r}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <input type="hidden" name="_self" value="1" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="allow_self_users" defaultChecked className="h-4 w-4" />
                {t('platform.companies.form.selfUsersLabel')}
              </label>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('platform.companies.form.submitCreate')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {noData ? (
        <EmptyState
          icon={<Building2 />}
          title={t('platform.companies.empty')}
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              {t('platform.companies.emptyAction')}
            </Button>
          }
        />
      ) : (
        <>
          <ListToolbar
            search={searchInput}
            onSearch={setSearchInput}
            placeholder={t('platform.companies.searchPlaceholder')}
            count={rows.length}
            total={total}
            filters={
              <Select
                aria-label={t('platform.companies.thStatus')}
                value={filters.status}
                onChange={(e) => pushParams({ status: e.target.value as StatusFilter, page: 1 })}
                className="sm:w-44"
              >
                <option value="all">{t('platform.companies.filterAll')}</option>
                {STATUS_FILTERS.map((s) => (
                  <option key={s} value={s}>
                    {t(`platform.state.${s}`)}
                  </option>
                ))}
              </Select>
            }
            actions={newButton}
          />

          <Card>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <EmptyState
                  icon={<SearchX />}
                  title={t('platform.companies.noResults')}
                  description={t('platform.companies.noResultsHint')}
                  className="border-0"
                />
              ) : (
                <div className={`overflow-x-auto ${navPending ? 'opacity-60 transition-opacity' : ''}`}>
                  <table className="w-full text-sm">
                    <thead className="border-b text-start text-muted-foreground">
                      <tr className="text-start">
                        <SortHeader label={t('platform.companies.thCompany')} k="name" />
                        <th className="p-3 font-medium">{t('platform.companies.thActivity')}</th>
                        <th className="p-3 font-medium">{t('platform.companies.thStatus')}</th>
                        <SortHeader label={t('platform.companies.thExpiry')} k="expiry" />
                        <SortHeader label={t('platform.companies.thCreated')} k="created" />
                        <th className="p-3 font-medium">{t('platform.companies.thBranches')}</th>
                        <th className="p-3 font-medium">{t('platform.companies.thUsers')}</th>
                        <th className="p-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ company, branches, users }) => {
                        const state = subscriptionState(company);
                        const left = daysLeft(company);
                        const badgeVariant = STATE_BADGE_VARIANT[state];
                        const stateLabel = t(`platform.state.${state}`);
                        const accent = STATE_ACCENT[state] ?? '';
                        return (
                          <tr key={company.id} className={`border-b last:border-0 ${accent}`}>
                            <td className="p-3">
                              <Link href={`/platform/companies/${company.id}`} className="font-medium hover:text-primary hover:underline">
                                {company.name_ar || company.name}
                              </Link>
                              {company.slug && (
                                <div dir="ltr" className="text-right text-xs text-muted-foreground">
                                  /{company.slug}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {company.business_type
                                ? BUSINESS_TYPE_LABELS[company.business_type]?.[locale]
                                : '—'}
                            </td>
                            <td className="p-3">
                              <Badge variant={badgeVariant}>{stateLabel}</Badge>
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {company.subscription_end ? (
                                <span dir="ltr">
                                  {company.subscription_end}
                                  {left !== null && (
                                    <span className="text-xs"> ({left} {t('platform.companies.daysSuffix')})</span>
                                  )}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {company.created_at ? (
                                <span dir="ltr">{company.created_at.slice(0, 10)}</span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="p-3">{branches}</td>
                            <td className="p-3">{users}</td>
                            <td className="p-3">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant={company.is_active ? 'outline' : 'default'}
                                  size="sm"
                                  disabled={pending}
                                  onClick={() => onToggleActive(company.id, !company.is_active)}
                                >
                                  <Power className="h-4 w-4" />
                                  {company.is_active ? t('platform.companies.suspend') : t('platform.companies.activate')}
                                </Button>
                                <Link href={`/platform/companies/${company.id}`}>
                                  <Button variant="secondary" size="sm">
                                    <Settings2 className="h-4 w-4" />
                                    {t('platform.companies.manage')}
                                  </Button>
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            disabled={navPending}
            onPageChange={(p) => pushParams({ page: p })}
          />
        </>
      )}
    </div>
  );
}
