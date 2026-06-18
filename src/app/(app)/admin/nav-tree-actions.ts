'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { getPlatformContext, hasPlatformPermission } from '@/lib/erp/platform-context';
import { loadCompaniesList } from '@/app/(app)/platform/companies/companies-workbench-server';

export type NavType = 'company' | 'user' | 'role' | 'branch' | 'feature';

export interface NavNode { id: string; label: string; secondary?: string; href: string }

const FEATURE_DOMAINS = ['inventory', 'pos', 'governance', 'scanning', 'contacts'] as const;

/**
 * Lazy branch loader for the Admin Navigation Tree. Read-only; admin/platform-
 * gated per type (defense in depth on top of RLS). Reuses existing loaders and
 * each type's existing workbench URL — no new data model, no logic change.
 */
export async function loadNavBranch(type: NavType): Promise<NavNode[]> {
  const ctx = await getUserContext();
  if (!ctx) return [];
  const isAdmin = ctx.isPlatformOwner === true || ctx.isSuperAdmin === true || ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) return [];
  const supabase = await createClient();

  switch (type) {
    case 'company': {
      const pctx = await getPlatformContext();
      if (!hasPlatformPermission(pctx, 'view_companies')) return [];
      const rows = await loadCompaniesList(supabase);
      return rows.map((c) => ({ id: c.id, label: c.name_ar || c.name, secondary: c.plan_key ?? undefined, href: `/platform/companies?id=${c.id}` }));
    }
    case 'user': {
      const { data } = await supabase.rpc('erp_scoped_members');
      const seen = new Map<string, NavNode>();
      for (const raw of (data ?? []) as unknown as Array<{ user_id: string; role: string; full_name: string | null; email: string | null }>) {
        if (!seen.has(raw.user_id)) {
          seen.set(raw.user_id, {
            id: raw.user_id,
            label: raw.full_name?.trim() || raw.email || raw.user_id,
            secondary: raw.role,
            href: `/settings/users?id=${raw.user_id}`,
          });
        }
      }
      return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
    }
    case 'role': {
      if (!ctx.companyId) return [];
      const [{ data: companyRoles }, { data: allRoles }] = await Promise.all([
        supabase.from('erp_company_roles').select('role_key, enabled').eq('company_id', ctx.companyId),
        supabase.from('erp_roles').select('key, name_ar, is_system, rank').order('rank', { ascending: false }),
      ]);
      const nameByKey = new Map((allRoles ?? []).map((r) => [r.key as string, (r.name_ar as string | null) ?? null]));
      const keys = companyRoles && companyRoles.length > 0
        ? (companyRoles as Array<{ role_key: string; enabled: boolean }>).filter((r) => r.enabled).map((r) => r.role_key)
        : (allRoles ?? []).filter((r) => r.is_system).map((r) => r.key as string);
      return keys.map((k) => ({ id: k, label: nameByKey.get(k) || k, secondary: k, href: `/settings/authz?id=${k}` }));
    }
    case 'branch': {
      if (!ctx.companyId) return [];
      const { data } = await supabase.from('erp_branches').select('id, code, name, name_ar').eq('company_id', ctx.companyId).order('code');
      return (data ?? []).map((b) => ({ id: b.id as string, label: `${b.code} · ${(b.name_ar as string) || (b.name as string)}`, href: `/settings/branches?id=${b.id}` }));
    }
    case 'feature':
      return FEATURE_DOMAINS.map((d) => ({ id: d, label: d, href: `/settings/features?id=${d}` }));
    default:
      return [];
  }
}
