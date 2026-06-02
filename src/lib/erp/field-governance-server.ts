import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEntity } from './entities';
import { getActiveCustomFields } from './custom-fields-server';
import {
  resolveAccess,
  evaluateCondition,
  type AccessLevel,
  type AccessRow,
  type FieldCondition,
} from './field-governance';
import type { UserContext } from './auth-context';

/** Default protected (identity/critical) fields per entity. Admins are never
 *  locked out of these. '*' applies to every entity unless overridden. */
const PROTECTED_DEFAULTS: Record<string, string[]> = {
  '*': ['code', 'name'],
};
export function isDefaultProtected(entity: string, key: string): boolean {
  return (PROTECTED_DEFAULTS[entity] ?? PROTECTED_DEFAULTS['*']).includes(key);
}

/** Company admin / IT admin / platform owner — the never-locked-out roles. */
export function isAdminContext(ctx: UserContext): boolean {
  const roles = ctx.memberships.map((m) => m.role as string);
  return ctx.isPlatformOwner || ctx.isSuperAdmin || roles.includes('admin') || roles.includes('it_admin');
}

interface ConfigRow {
  field_key: string;
  source: 'core' | 'custom';
  section: string | null;
  sort: number;
  is_active: boolean;
  is_sensitive: boolean;
  is_protected: boolean;
  default_access: AccessLevel;
  inheritance: string;
  condition: FieldCondition | null;
}

export interface LayoutField {
  key: string;
  source: 'core' | 'custom';
  section: string | null;
  sort: number;
  access: AccessLevel;
  isSensitive: boolean;
  isProtected: boolean;
}

/**
 * Resolve the governed field layout for an entity, for the current user and an
 * optional record context (drives conditional applicability). Returns ALL fields
 * with their resolved access (callers render only access!=='hidden' and run
 * applyWriteAccess for write enforcement). With no config rows every field
 * resolves to 'edit' → identical to today.
 */
export async function getFieldLayout(
  supabase: SupabaseClient,
  ctx: UserContext,
  entity: string,
  recordContext: Record<string, unknown> = {},
): Promise<LayoutField[]> {
  const desc = getEntity(entity);
  const core = (desc?.fields ?? []).map((f) => ({ key: f.key, source: 'core' as const }));
  const custom = (await getActiveCustomFields(entity)).map((c) => ({ key: c.key, source: 'custom' as const }));
  const all = [...core, ...custom];

  const [{ data: cfgRows }, { data: accRows }] = await Promise.all([
    supabase.from('erp_field_config').select('*').eq('entity', entity),
    supabase.from('erp_field_access').select('field_key, subject_type, subject_key, access').eq('entity', entity),
  ]);
  const cfgByKey = new Map<string, ConfigRow>((cfgRows ?? []).map((r) => [(r as ConfigRow).field_key, r as ConfigRow]));
  const accByKey = new Map<string, AccessRow[]>();
  for (const a of (accRows ?? []) as Array<{ field_key: string; subject_type: 'role' | 'permission'; subject_key: string; access: AccessLevel }>) {
    const list = accByKey.get(a.field_key) ?? [];
    list.push({ subjectType: a.subject_type, subjectKey: a.subject_key, access: a.access });
    accByKey.set(a.field_key, list);
  }

  const roles = ctx.memberships.map((m) => m.role as string);
  const perms = ctx.permissions as unknown as string[];
  const admin = isAdminContext(ctx);

  return all
    .map((f, idx) => {
      const cfg = cfgByKey.get(f.key);
      const isProtected = cfg?.is_protected ?? isDefaultProtected(entity, f.key);
      const access = resolveAccess({
        defaultAccess: cfg?.default_access ?? 'edit',
        isProtected,
        isActive: cfg?.is_active ?? true,
        applicable: evaluateCondition(cfg?.condition ?? null, recordContext),
        accessRows: accByKey.get(f.key) ?? [],
        userRoles: roles,
        userPermissions: perms,
        isAdmin: admin,
      });
      return {
        key: f.key,
        source: f.source,
        section: cfg?.section ?? null,
        sort: cfg?.sort ?? idx,
        access,
        isSensitive: cfg?.is_sensitive ?? false,
        isProtected,
      };
    })
    .sort((a, b) => a.sort - b.sort);
}

// ── Admin view (DFG-2) ───────────────────────────────────────────────────────
export interface AdminField {
  key: string;
  source: 'core' | 'custom';
  labelAr: string;
  labelEn: string;
  isProtected: boolean;
  config: Record<string, unknown> | null;
  access: Array<{ subject_type: string; subject_key: string; access: string }>;
}
export interface FieldGovernanceAdmin {
  entity: string;
  fields: AdminField[];
  sections: Array<Record<string, unknown>>;
  roles: Array<{ key: string; name_ar: string | null }>;
}

/** Everything the field-governance admin UI needs for one entity. */
export async function getFieldGovernanceAdmin(
  supabase: SupabaseClient,
  entity: string,
): Promise<FieldGovernanceAdmin> {
  const desc = getEntity(entity);
  const core = (desc?.fields ?? []).map((f) => ({ key: f.key, source: 'core' as const, labelAr: f.labelAr, labelEn: f.labelEn }));
  const custom = (await getActiveCustomFields(entity)).map((c) => ({
    key: c.key, source: 'custom' as const, labelAr: c.label_ar, labelEn: c.label_en ?? c.label_ar,
  }));
  const [{ data: cfgRows }, { data: accRows }, { data: secRows }, { data: roleRows }] = await Promise.all([
    supabase.from('erp_field_config').select('*').eq('entity', entity),
    supabase.from('erp_field_access').select('field_key, subject_type, subject_key, access').eq('entity', entity),
    supabase.from('erp_field_sections').select('*').eq('entity', entity).order('sort'),
    supabase.from('erp_roles').select('key, name_ar').order('rank', { ascending: false }),
  ]);
  const cfgByKey = new Map<string, Record<string, unknown>>((cfgRows ?? []).map((r) => [(r as { field_key: string }).field_key, r as Record<string, unknown>]));
  const accByKey = new Map<string, Array<{ subject_type: string; subject_key: string; access: string }>>();
  for (const a of (accRows ?? []) as Array<{ field_key: string; subject_type: string; subject_key: string; access: string }>) {
    const list = accByKey.get(a.field_key) ?? [];
    list.push({ subject_type: a.subject_type, subject_key: a.subject_key, access: a.access });
    accByKey.set(a.field_key, list);
  }
  const fields: AdminField[] = [...core, ...custom].map((f) => {
    const config = cfgByKey.get(f.key) ?? null;
    return {
      key: f.key,
      source: f.source,
      labelAr: f.labelAr,
      labelEn: f.labelEn,
      isProtected: (config?.is_protected as boolean | undefined) ?? isDefaultProtected(entity, f.key),
      config,
      access: accByKey.get(f.key) ?? [],
    };
  });
  // Order by config.sort when present, else registry order (stable).
  fields.sort((a, b) => ((a.config?.sort as number) ?? 1e9) - ((b.config?.sort as number) ?? 1e9));
  return {
    entity,
    fields,
    sections: (secRows ?? []) as Array<Record<string, unknown>>,
    roles: (roleRows ?? []) as Array<{ key: string; name_ar: string | null }>,
  };
}
