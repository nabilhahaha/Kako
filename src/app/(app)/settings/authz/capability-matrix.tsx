'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { PERMISSION_GROUP_LABELS } from '@/lib/erp/permissions';
import { DENY_ALL_CAPABILITIES, GRANULAR_CAPABILITY_LABELS } from '@/lib/erp/granular-capabilities';
import { setCompanyCapability } from './actions';
import type { AuthzRole } from '@/lib/erp/authz-console-server';

/** A. Capability Matrix (P6) — grant/revoke the 8 finer capabilities per role. */
export function CapabilityMatrix({
  roles,
  grants,
  fromBaseline,
}: {
  roles: AuthzRole[];
  grants: Record<string, string[]>;
  fromBaseline: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Optimistic copy: roleKey → Set(capability).
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>(
    Object.fromEntries(roles.map((r) => [r.key, new Set(grants[r.key] ?? [])])),
  );

  function toggle(roleKey: string, capability: string, enabled: boolean) {
    setMatrix((prev) => {
      const next = { ...prev, [roleKey]: new Set(prev[roleKey] ?? []) };
      if (enabled) next[roleKey].add(capability);
      else next[roleKey].delete(capability);
      return next;
    });
    startTransition(async () => {
      const res = await setCompanyCapability(roleKey, capability, enabled);
      if (!res.ok) {
        toast.error(t('authz.error'));
        router.refresh();
        return;
      }
      toast.success(t('authz.saved'));
    });
  }

  // Group the 8 capabilities by their `group`.
  type Cap = (typeof DENY_ALL_CAPABILITIES)[number];
  const groups = new Map<string, Cap[]>();
  for (const cap of DENY_ALL_CAPABILITIES) {
    const g = GRANULAR_CAPABILITY_LABELS[cap].group;
    groups.set(g, [...(groups.get(g) ?? []), cap]);
  }

  if (roles.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('authz.capNoRoles')}</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">{t('authz.capTitle')}</h3>
        <p className="text-xs text-muted-foreground">{t('authz.capHint')}</p>
        <p className="mt-1 text-xs text-warning">{t('authz.capAdminRecommended')}</p>
        {fromBaseline && <p className="mt-1 text-xs text-muted-foreground">{t('authz.capBaselineNote')}</p>}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="sticky start-0 bg-secondary/50 p-3 text-start font-medium">{t('authz.capColCapability')}</th>
                  {roles.map((r) => (
                    <th key={r.key} className="whitespace-nowrap p-3 text-center font-medium">
                      {locale === 'ar' ? r.name_ar || r.key : r.key}
                    </th>
                  ))}
                </tr>
              </thead>
              {[...groups.entries()].map(([group, caps]) => (
                <tbody key={group}>
                  <tr className="border-b bg-secondary/30">
                    <td colSpan={roles.length + 1} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                      {PERMISSION_GROUP_LABELS[group]?.[locale] ?? group}
                    </td>
                  </tr>
                  {caps.map((cap) => {
                    const label = GRANULAR_CAPABILITY_LABELS[cap];
                    const high = label.risk === 'high';
                    return (
                      <tr key={cap} className="border-b">
                        <td className="sticky start-0 bg-background p-3">
                          <div className="flex flex-col gap-1">
                            <span className="flex items-center gap-1.5">
                              {high && <ShieldAlert className="h-3.5 w-3.5 text-destructive" aria-hidden />}
                              {locale === 'ar' ? label.ar : label.en}
                            </span>
                            <span className="flex items-center gap-1">
                              <Badge variant={high ? 'destructive' : 'warning'} className="gap-1">
                                {high ? t('authz.riskHigh') : t('authz.riskElevated')}
                              </Badge>
                              <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">{cap}</span>
                            </span>
                          </div>
                        </td>
                        {roles.map((r) => {
                          const checked = matrix[r.key]?.has(cap) ?? false;
                          return (
                            <td key={r.key} className="p-3 text-center">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-primary"
                                checked={checked}
                                disabled={pending}
                                onChange={(e) => toggle(r.key, cap, e.target.checked)}
                                aria-label={`${locale === 'ar' ? label.ar : label.en} — ${r.key}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
