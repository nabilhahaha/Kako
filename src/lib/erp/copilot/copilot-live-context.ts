import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { roleCapabilities, describeCompanyRule } from './copilot-engine';

/**
 * Help Copilot — LIVE context resolver.
 *
 * The static KB explains general concepts; THIS module resolves company-specific,
 * runtime-current configuration so the Copilot self-updates when roles, role
 * permissions, modules, or company rules change. Reads are RLS-scoped to the
 * caller's tenant (company members may read their own role config / settings /
 * modules). Only safe, non-sensitive metadata is cached, with a short TTL and an
 * explicit invalidator the config-write paths call.
 */

export interface LiveCompanyConfig {
  companyId: string;
  modules: string[];
  /** role_key → its current permission keys (company config, else global default). */
  rolePerms: Record<string, string[]>;
  enabledRoles: string[];
  settings: {
    defaultGpsRadiusM: number | null;
    dayCloseMinCoverage: number | null;
    vanTransferAutoApproveBelow: number | null;
  } | null;
  fetchedAt: number;
}

const TTL_MS = 60_000;
const cache = new Map<string, LiveCompanyConfig>();

/** Drop the cached config for a company — call after any role/permission/module/
 *  settings change so the Copilot reflects it immediately. */
export function invalidateCompanyCopilotCache(companyId: string): void {
  cache.delete(companyId);
}

export async function getLiveCompanyConfig(
  supabase: SupabaseClient,
  companyId: string,
): Promise<LiveCompanyConfig> {
  const cached = cache.get(companyId);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;

  const [companyRolesRes, companyPermsRes, globalPermsRes, modulesRes, settingsRes] = await Promise.all([
    supabase.from('erp_company_roles').select('role_key, enabled').eq('company_id', companyId),
    supabase.from('erp_company_role_permissions').select('role_key, permission').eq('company_id', companyId),
    supabase.from('erp_role_permissions').select('role_key, permission'),
    supabase.from('erp_company_modules').select('module, enabled').eq('company_id', companyId),
    supabase.from('erp_fmcg_settings').select('default_gps_radius_m, day_close_min_coverage, van_transfer_auto_approve_below').eq('company_id', companyId).maybeSingle(),
  ]);

  const companyRoles = (companyRolesRes.data ?? []) as { role_key: string; enabled: boolean }[];
  const hasCompanyConfig = companyRoles.length > 0;
  const enabledRoles = hasCompanyConfig
    ? companyRoles.filter((r) => r.enabled).map((r) => r.role_key)
    : [...new Set(((globalPermsRes.data ?? []) as { role_key: string }[]).map((r) => r.role_key))];

  const rolePerms: Record<string, string[]> = {};
  const source = hasCompanyConfig
    ? ((companyPermsRes.data ?? []) as { role_key: string; permission: string }[])
    : ((globalPermsRes.data ?? []) as { role_key: string; permission: string }[]);
  for (const row of source) {
    (rolePerms[row.role_key] ??= []).push(row.permission);
  }

  const modulesRows = (modulesRes.data ?? []) as { module: string; enabled: boolean }[];
  const modules = modulesRows.length > 0 ? modulesRows.filter((m) => m.enabled).map((m) => m.module) : [];

  const s = settingsRes.data as { default_gps_radius_m: number | null; day_close_min_coverage: number | null; van_transfer_auto_approve_below: number | null } | null;

  const cfg: LiveCompanyConfig = {
    companyId,
    modules,
    rolePerms,
    enabledRoles,
    settings: s
      ? { defaultGpsRadiusM: s.default_gps_radius_m, dayCloseMinCoverage: s.day_close_min_coverage, vanTransferAutoApproveBelow: s.van_transfer_auto_approve_below }
      : null,
    fetchedAt: Date.now(),
  };
  cache.set(companyId, cfg);
  return cfg;
}

/** "What can role X do?" from the company's CURRENT grants (handles brand-new
 *  roles, since it reads live config, not the static role template). */
export async function liveRoleCapabilities(
  supabase: SupabaseClient,
  companyId: string,
  roleKey: string,
  locale: 'en' | 'ar' = 'en',
): Promise<{ group: string; items: string[] }[]> {
  const cfg = await getLiveCompanyConfig(supabase, companyId);
  return roleCapabilities(cfg.rolePerms[roleKey] ?? [], locale);
}

/** Company rule sentences phrased with the LIVE values. */
export async function liveCompanyRules(
  supabase: SupabaseClient,
  companyId: string,
  locale: 'en' | 'ar' = 'en',
): Promise<string[]> {
  const cfg = await getLiveCompanyConfig(supabase, companyId);
  const out: string[] = [];
  out.push(describeCompanyRule('gps_radius', cfg.settings?.defaultGpsRadiusM ?? 150, locale));
  out.push(describeCompanyRule('min_coverage', cfg.settings?.dayCloseMinCoverage ?? 80, locale));
  if (cfg.settings?.vanTransferAutoApproveBelow != null) {
    out.push(describeCompanyRule('van_auto_approve', cfg.settings.vanTransferAutoApproveBelow, locale));
  }
  return out;
}
