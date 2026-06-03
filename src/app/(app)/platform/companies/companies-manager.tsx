'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ListToolbar } from '@/components/shared/list-toolbar';
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

type SortKey = 'name' | 'expiry' | 'branches' | 'users' | 'created';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | SubscriptionState;

const PAGE_SIZE = 25;
const STATUS_FILTERS: SubscriptionState[] = ['active', 'expiring', 'expired', 'suspended', 'trial'];

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function CompaniesManager({ rows, btDefaults, btRoles, roleLabels }: { rows: CompanyRow[]; btDefaults: Record<string, string[]>; btRoles: Record<string, string[]>; roleLabels: Record<string, string> }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(false);

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

  // ── list controls (search / filter / sort / paginate) ──────────────
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);

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
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  }

  // Filter → sort → paginate (client-side; only the current page is rendered).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter(({ company }) => {
      if (q) {
        const hay = `${company.name ?? ''} ${company.name_ar ?? ''} ${company.slug ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (status !== 'all' && subscriptionState(company) !== status) return false;
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'branches':
          return (a.branches - b.branches) * dir;
        case 'users':
          return (a.users - b.users) * dir;
        case 'expiry': {
          // Nulls (open-ended) sort last regardless of direction.
          const av = a.company.subscription_end;
          const bv = b.company.subscription_end;
          if (!av && !bv) return 0;
          if (!av) return 1;
          if (!bv) return -1;
          return av.localeCompare(bv) * dir;
        }
        case 'created':
          return (a.company.created_at ?? '').localeCompare(b.company.created_at ?? '') * dir;
        case 'name':
        default: {
          const an = (a.company.name_ar || a.company.name || '').toLowerCase();
          const bn = (b.company.name_ar || b.company.name || '').toLowerCase();
          return an.localeCompare(bn) * dir;
        }
      }
    });
    return list;
  }, [rows, search, status, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th className="p-3 font-medium">
        <button
          type="button"
          onClick={() => onSort(k)}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          {label}
          {active &&
            (sortDir === 'asc' ? (
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

      {rows.length === 0 ? (
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
            search={search}
            onSearch={(v) => {
              setSearch(v);
              setPage(0);
            }}
            placeholder={t('platform.companies.searchPlaceholder')}
            count={filtered.length}
            total={rows.length}
            filters={
              <Select
                aria-label={t('platform.companies.thStatus')}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as StatusFilter);
                  setPage(0);
                }}
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
              {filtered.length === 0 ? (
                <EmptyState
                  icon={<SearchX />}
                  title={t('platform.companies.noResults')}
                  description={t('platform.companies.noResultsHint')}
                  className="border-0"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-start text-muted-foreground">
                      <tr className="text-start">
                        <SortHeader label={t('platform.companies.thCompany')} k="name" />
                        <th className="p-3 font-medium">{t('platform.companies.thActivity')}</th>
                        <th className="p-3 font-medium">{t('platform.companies.thStatus')}</th>
                        <SortHeader label={t('platform.companies.thExpiry')} k="expiry" />
                        <SortHeader label={t('platform.companies.thCreated')} k="created" />
                        <SortHeader label={t('platform.companies.thBranches')} k="branches" />
                        <SortHeader label={t('platform.companies.thUsers')} k="users" />
                        <th className="p-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map(({ company, branches, users }) => {
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

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                {t('platform.companies.prev')}
              </Button>
              <span className="text-sm text-muted-foreground" dir="ltr">
                {t('platform.companies.pageOf', { page: safePage + 1, pages: pageCount })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                {t('platform.companies.next')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
