'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';
import { BRANCH_ROLES } from '@/lib/erp/constants';
import type { BranchRole } from '@/lib/erp/types';
import {
  loadOrgStructure,
  setCompanyRoleEnabled,
  setOrgHierarchy,
  type OrgStructureData,
} from './actions';

/** E. Organization Structure — optional roles + reporting hierarchy, editable
 *  AFTER creation by the Company Admin. Loads client-side on mount (mirrors the
 *  Section-Access tab's loadSectionAccess pattern). Roles/hierarchy drive scope
 *  through P3 (reports_to → erp_user_subtree). Never shows raw role keys. */
export function OrgStructurePanel() {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<OrgStructureData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadOrgStructure().then((res) => {
      if (!active) return;
      if (res.ok && res.data) setData(res.data);
      else toast.error(t('authz.error'));
      setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roleLabel = (key: string): string =>
    (BRANCH_ROLES as Record<string, { en: string; ar: string }>)[key]?.[ar ? 'ar' : 'en'] ?? key;

  // Build the merged view: every known catalog role, with its enabled flag and
  // company-default reports-to (branch_id null). admin is always enabled.
  const catalogRoles = Object.keys(BRANCH_ROLES) as BranchRole[];
  const enabledMap = new Map((data?.roles ?? []).map((r) => [r.role_key, r.enabled] as const));
  const isEnabled = (role: BranchRole) =>
    role === 'admin' ? true : (enabledMap.get(role) ?? false);

  // company-default reports-to (branch_id null) per role
  const defaultParent = new Map<string, string | null>();
  for (const h of data?.hierarchy ?? []) {
    if (h.branch_id === null) defaultParent.set(h.role_key, h.reports_to_role_key);
  }

  const enabledRoles = catalogRoles.filter(isEnabled);

  function onToggle(role: BranchRole, next: boolean) {
    if (role === 'admin') return;
    // optimistic
    setData((prev) => {
      if (!prev) return prev;
      const rest = prev.roles.filter((r) => r.role_key !== role);
      return { ...prev, roles: [...rest, { role_key: role, enabled: next }] };
    });
    startTransition(async () => {
      const res = await setCompanyRoleEnabled(role, next);
      if (!res.ok) {
        toast.error(t('authz.error'));
        // revert
        setData((prev) => {
          if (!prev) return prev;
          const rest = prev.roles.filter((r) => r.role_key !== role);
          return { ...prev, roles: [...rest, { role_key: role, enabled: !next }] };
        });
        return;
      }
      toast.success(t('authz.saved'));
      router.refresh();
    });
  }

  function onReportsTo(role: BranchRole, value: string) {
    const reportsTo = value === '' ? null : value;
    // optimistic
    setData((prev) => {
      if (!prev) return prev;
      const rest = prev.hierarchy.filter((h) => !(h.role_key === role && h.branch_id === null));
      return {
        ...prev,
        hierarchy: [...rest, { role_key: role, reports_to_role_key: reportsTo, branch_id: null }],
      };
    });
    startTransition(async () => {
      const res = await setOrgHierarchy(role, reportsTo, null);
      if (!res.ok) {
        toast.error(t('authz.error'));
        router.refresh();
        return;
      }
      toast.success(t('authz.saved'));
      router.refresh();
    });
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t('authz.orgLoading')}</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">{t('authz.orgTitle')}</h3>
        <p className="text-xs text-muted-foreground">{t('authz.orgHint')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Roles — enable/disable */}
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div>
              <h4 className="text-sm font-medium">{t('authz.orgRolesTitle')}</h4>
              <p className="text-xs text-muted-foreground">{t('authz.orgRolesHint')}</p>
            </div>
            <ul className="divide-y rounded-md border">
              {catalogRoles.map((role) => {
                const isAdmin = role === 'admin';
                const enabled = isEnabled(role);
                return (
                  <li key={role} className="flex items-center justify-between gap-2 p-2.5">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{roleLabel(role)}</span>
                      {isAdmin && <Badge variant="secondary">{t('authz.orgRoleMandatory')}</Badge>}
                    </span>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{enabled ? t('authz.orgRoleEnabled') : t('authz.orgRoleDisabled')}</span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--primary,#0891b2)]"
                        checked={enabled}
                        disabled={isAdmin || pending}
                        onChange={(e) => onToggle(role, e.target.checked)}
                        aria-label={roleLabel(role)}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {/* Hierarchy — reports-to per enabled non-admin role */}
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div>
              <h4 className="text-sm font-medium">{t('authz.orgHierarchyTitle')}</h4>
              <p className="text-xs text-muted-foreground">{t('authz.orgHierarchyHint')}</p>
            </div>
            {enabledRoles.filter((r) => r !== 'admin').length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('authz.orgNoEnabledRoles')}</p>
            ) : (
              <ul className="space-y-2">
                {enabledRoles
                  .filter((role) => role !== 'admin')
                  .map((role) => {
                    const current = defaultParent.get(role) ?? '';
                    const options = enabledRoles.filter((o) => o !== role);
                    return (
                      <li key={role} className="space-y-1">
                        <span className="text-sm font-medium">{roleLabel(role)}</span>
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t('authz.orgReportsTo')}
                          </span>
                          <Select
                            className="h-9 text-sm"
                            value={current ?? ''}
                            disabled={pending}
                            onChange={(e) => onReportsTo(role, e.target.value)}
                          >
                            <option value="">{t('authz.orgTopLevel')}</option>
                            {options.map((o) => (
                              <option key={o} value={o}>
                                {roleLabel(o)}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
