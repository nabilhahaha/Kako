'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { SCOPE_DIMENSIONS, isTransitiveDimension, type ScopeDimension, type ScopeRef } from '@/lib/erp/scope';
import { setUserScope, removeUserScope } from './actions';
import type { AuthzMember, AuthzNamedEntity, AuthzRole } from '@/lib/erp/authz-console-server';

const DIM_KEY: Record<ScopeDimension, string> = {
  company: 'authz.dimCompany',
  branch: 'authz.dimBranch',
  region: 'authz.dimRegion',
  area: 'authz.dimArea',
  own_customers: 'authz.dimOwnCustomers',
  own_team: 'authz.dimOwnTeam',
};

/** B. Per-user Scope (P3) — declare a visibility scope per user+role. */
export function ScopePanel({
  members,
  roles,
  branches,
  regions,
  areas,
  scopeRows,
}: {
  members: AuthzMember[];
  roles: AuthzRole[];
  branches: AuthzNamedEntity[];
  regions: AuthzNamedEntity[];
  areas: AuthzNamedEntity[];
  scopeRows: ScopeRef[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ar = locale === 'ar';

  // Working selections per user (default to the user's first role).
  const [sel, setSel] = useState<Record<string, { roleKey: string; dimension: ScopeDimension; scopeSet: string[] }>>(
    {},
  );

  const roleName = (key: string) => roles.find((r) => r.key === key)?.name_ar || key;
  const entitiesFor = (dim: ScopeDimension): AuthzNamedEntity[] =>
    dim === 'branch' ? branches : dim === 'region' ? regions : dim === 'area' ? areas : [];

  function workingFor(m: AuthzMember) {
    return sel[m.id] ?? { roleKey: m.roleKeys[0] ?? '', dimension: 'company' as ScopeDimension, scopeSet: [] };
  }
  function update(id: string, patch: Partial<{ roleKey: string; dimension: ScopeDimension; scopeSet: string[] }>) {
    setSel((prev) => {
      const cur = prev[id] ?? { roleKey: '', dimension: 'company' as ScopeDimension, scopeSet: [] };
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  }

  function save(m: AuthzMember) {
    const w = workingFor(m);
    if (!w.roleKey) return;
    startTransition(async () => {
      const res = await setUserScope(m.id, w.roleKey, w.dimension, w.scopeSet);
      if (!res.ok) { toast.error(t('authz.error')); return; }
      toast.success(t('authz.saved'));
      router.refresh();
    });
  }
  function clear(userId: string, roleKey: string) {
    startTransition(async () => {
      const res = await removeUserScope(userId, roleKey);
      if (!res.ok) { toast.error(t('authz.error')); return; }
      toast.success(t('authz.saved'));
      router.refresh();
    });
  }

  function rowsFor(userId: string): ScopeRef[] {
    return scopeRows.filter((s) => s.userId === userId);
  }

  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('authz.scopeNoMembers')}</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">{t('authz.scopeTitle')}</h3>
        <p className="text-xs text-muted-foreground">{t('authz.scopeHint')}</p>
      </div>

      <div className="space-y-3">
        {members.map((m) => {
          const w = workingFor(m);
          const opts = entitiesFor(w.dimension);
          const geo = opts.length > 0;
          const existing = rowsFor(m.id);
          return (
            <Card key={m.id}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{m.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {m.roleKeys.map((k) => (ar ? roleName(k) : k)).join(' · ')}
                    </span>
                  </div>
                </div>

                {/* Current assignments */}
                {existing.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('authz.scopeNoAssignment')}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {existing.map((s) => (
                      <Badge key={s.id} variant="secondary" className="gap-1.5">
                        <span dir="ltr">{ar ? roleName(s.roleKey) : s.roleKey}</span>·
                        <span>{t(DIM_KEY[s.dimension])}</span>
                        {isTransitiveDimension(s.dimension) && <span className="opacity-70">({t('authz.scopeTransitive')})</span>}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => clear(m.id, s.roleKey)}
                          className="text-destructive hover:opacity-70"
                          aria-label={t('authz.scopeClear')}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Set / change assignment */}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">{t('authz.role')}</label>
                    <Select className="h-9 text-sm" value={w.roleKey} disabled={pending} onChange={(e) => update(m.id, { roleKey: e.target.value })}>
                      {m.roleKeys.length === 0 && <option value="">—</option>}
                      {m.roleKeys.map((k) => <option key={k} value={k}>{ar ? roleName(k) : k}</option>)}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">{t('authz.scopeDimension')}</label>
                    <Select className="h-9 text-sm" value={w.dimension} disabled={pending} onChange={(e) => update(m.id, { dimension: e.target.value as ScopeDimension, scopeSet: [] })}>
                      {SCOPE_DIMENSIONS.map((d) => <option key={d} value={d}>{t(DIM_KEY[d])}</option>)}
                    </Select>
                  </div>
                  {geo && (
                    <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                      <label className="text-[11px] text-muted-foreground">{t('authz.scopeEntities')}</label>
                      <select
                        multiple
                        value={w.scopeSet}
                        disabled={pending}
                        onChange={(e) => update(m.id, { scopeSet: Array.from(e.target.selectedOptions, (o) => o.value) })}
                        className="min-h-[5rem] w-full rounded-md border border-input bg-background p-1.5 text-sm"
                      >
                        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                      <p className="text-[11px] text-muted-foreground">{t('authz.scopeEntitiesHint')}</p>
                    </div>
                  )}
                  <div className="flex items-end">
                    <Button size="sm" disabled={pending || !w.roleKey} onClick={() => save(m)}>{t('authz.scopeSet')}</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
