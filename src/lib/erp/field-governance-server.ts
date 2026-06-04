import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEntity } from './entities';
import { getActiveCustomFields } from './custom-fields-server';
import {
  resolveAccess,
  evaluateCondition,
  isSectionAccessible,
  type AccessLevel,
  type AccessRow,
  type FieldCondition,
  type GovInputs,
  type GovField,
  type SectionAccessRow,
  type SectionAccessLevel,
} from './field-governance';
import { expandAliases } from './capabilities';
import type { UserContext } from './auth-context';

/** Raw erp_field_section_access row shape (snake_case). */
interface SectionAccessDbRow {
  section_key: string;
  subject_type: 'role' | 'permission' | 'capability';
  subject_key: string;
  access: SectionAccessLevel;
}

/** Index section-access rows by section key (P5). */
function indexSectionAccess(rows: SectionAccessDbRow[] | null | undefined): Record<string, SectionAccessRow[]> {
  const map: Record<string, SectionAccessRow[]> = {};
  for (const r of rows ?? []) {
    (map[r.section_key] ??= []).push({
      subjectType: r.subject_type,
      subjectKey: r.subject_key,
      access: r.access,
    });
  }
  return map;
}

/** The current user's effective granular capabilities (P5): legacy flat perms
 *  expanded through the P1 alias layer, so a 'capability'-subject access row
 *  matches when the user effectively holds that capability. */
function userCapabilitiesOf(ctx: UserContext): string[] {
  return [...expandAliases(ctx.permissions as unknown as string[])];
}

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

  // DFG-2d (B1): read the PUBLISHED snapshot if one exists; else fall back to the
  // live (draft) tables → registry defaults. Safe defaults preserved.
  const { data: pub } = await supabase
    .from('erp_field_config_versions')
    .select('snapshot')
    .eq('entity', entity).eq('status', 'published')
    .maybeSingle();
  const snapshot = (pub as { snapshot?: { config?: ConfigRow[]; access?: Array<{ field_key: string; subject_type: 'role' | 'permission'; subject_key: string; access: AccessLevel }> } } | null)?.snapshot;

  let cfgList: ConfigRow[];
  let accList: Array<{ field_key: string; subject_type: 'role' | 'permission'; subject_key: string; access: AccessLevel }>;
  if (snapshot) {
    cfgList = snapshot.config ?? [];
    accList = snapshot.access ?? [];
  } else {
    const [{ data: cfgRows }, { data: accRows }] = await Promise.all([
      supabase.from('erp_field_config').select('*').eq('entity', entity),
      supabase.from('erp_field_access').select('field_key, subject_type, subject_key, access').eq('entity', entity),
    ]);
    cfgList = (cfgRows ?? []) as ConfigRow[];
    accList = (accRows ?? []) as typeof accList;
  }
  const cfgByKey = new Map<string, ConfigRow>(cfgList.map((r) => [r.field_key, r]));
  const accByKey = new Map<string, AccessRow[]>();
  for (const a of accList) {
    const list = accByKey.get(a.field_key) ?? [];
    list.push({ subjectType: a.subject_type, subjectKey: a.subject_key, access: a.access });
    accByKey.set(a.field_key, list);
  }

  // (P5) section-level access: visible sections gate their fields. No rows = no-op.
  const { data: secAccRows } = await supabase
    .from('erp_field_section_access')
    .select('section_key, subject_type, subject_key, access')
    .eq('entity', entity);
  const sectionAccess = indexSectionAccess(secAccRows as SectionAccessDbRow[] | null);

  const roles = ctx.memberships.map((m) => m.role as string);
  const perms = ctx.permissions as unknown as string[];
  const caps = userCapabilitiesOf(ctx);
  const admin = isAdminContext(ctx);

  return all
    .map((f, idx) => {
      const cfg = cfgByKey.get(f.key);
      const isProtected = cfg?.is_protected ?? isDefaultProtected(entity, f.key);
      const section = cfg?.section ?? null;
      let access = resolveAccess({
        defaultAccess: cfg?.default_access ?? 'edit',
        isProtected,
        isActive: cfg?.is_active ?? true,
        applicable: evaluateCondition(cfg?.condition ?? null, recordContext),
        accessRows: accByKey.get(f.key) ?? [],
        userRoles: roles,
        userPermissions: perms,
        userCapabilities: caps,
        isAdmin: admin,
      });
      // (P5) a field in a section the user can't access is hidden (protected fields
      // for admins are unaffected — admins always pass isSectionAccessible).
      if (section && !isSectionAccessible(sectionAccess[section], roles, perms, caps, admin)) {
        access = 'hidden';
      }
      return {
        key: f.key,
        source: f.source,
        section,
        sort: cfg?.sort ?? idx,
        access,
        isSensitive: cfg?.is_sensitive ?? false,
        isProtected,
      };
    })
    .sort((a, b) => a.sort - b.sort);
}

// ── Raw governance inputs for the form (DFG-3, shared client + server) ───────
interface SnapAccess { field_key: string; subject_type: 'role' | 'permission'; subject_key: string; access: AccessLevel }

/** Build the serializable governance inputs for an entity + current user, from
 *  the effective source (published snapshot, else live draft). Passed to the
 *  client form (renders/disables/requires) and reused server-side for write
 *  enforcement. Empty `fields` ⇒ ungoverned ⇒ form behaves exactly as today. */
export async function loadGovernanceInputs(
  supabase: SupabaseClient,
  ctx: UserContext,
  entity: string,
): Promise<GovInputs> {
  const desc = getEntity(entity);
  const core = (desc?.fields ?? []).map((f) => ({ key: f.key, source: 'core' as const }));
  const custom = (await getActiveCustomFields(entity)).map((c) => ({ key: c.key, source: 'custom' as const }));
  const all = [...core, ...custom];

  const { data: pub } = await supabase
    .from('erp_field_config_versions').select('snapshot').eq('entity', entity).eq('status', 'published').maybeSingle();
  const snapshot = (pub as { snapshot?: { config?: ConfigRow[]; access?: SnapAccess[] } } | null)?.snapshot;

  let cfgList: ConfigRow[];
  let accList: SnapAccess[];
  if (snapshot) {
    cfgList = snapshot.config ?? [];
    accList = snapshot.access ?? [];
  } else {
    const [{ data: cfgRows }, { data: accRows }] = await Promise.all([
      supabase.from('erp_field_config').select('*').eq('entity', entity),
      supabase.from('erp_field_access').select('field_key, subject_type, subject_key, access').eq('entity', entity),
    ]);
    cfgList = (cfgRows ?? []) as ConfigRow[];
    accList = (accRows ?? []) as SnapAccess[];
  }
  // (P5) section-level access rows participate in governance too.
  const { data: secAccRows } = await supabase
    .from('erp_field_section_access')
    .select('section_key, subject_type, subject_key, access')
    .eq('entity', entity);
  const sectionAccess = indexSectionAccess(secAccRows as SectionAccessDbRow[] | null);

  // No governance at all → ungoverned (empty inputs → resolver yields 'edit').
  if (cfgList.length === 0 && accList.length === 0 && Object.keys(sectionAccess).length === 0) {
    return { fields: [], userRoles: [], userPermissions: [], userCapabilities: [], sectionAccess: {}, isAdmin: isAdminContext(ctx) };
  }
  const cfgByKey = new Map<string, ConfigRow>(cfgList.map((r) => [r.field_key, r]));
  const accByKey = new Map<string, AccessRow[]>();
  for (const a of accList) {
    const list = accByKey.get(a.field_key) ?? [];
    list.push({ subjectType: a.subject_type, subjectKey: a.subject_key, access: a.access });
    accByKey.set(a.field_key, list);
  }
  const fields: GovField[] = all.map((f) => {
    const cfg = cfgByKey.get(f.key);
    return {
      key: f.key,
      source: f.source,
      isProtected: cfg?.is_protected ?? isDefaultProtected(entity, f.key),
      defaultAccess: cfg?.default_access ?? 'edit',
      isActive: cfg?.is_active ?? true,
      section: cfg?.section ?? null,
      condition: cfg?.condition ?? null,
      accessRows: accByKey.get(f.key) ?? [],
    };
  });
  return {
    fields,
    userRoles: ctx.memberships.map((m) => m.role as string),
    userPermissions: ctx.permissions as unknown as string[],
    userCapabilities: userCapabilitiesOf(ctx),
    sectionAccess,
    isAdmin: isAdminContext(ctx),
  };
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
  /** (P5) per-section access rows for the section-binding matrix. */
  sectionAccess: Array<{ section_key: string; subject_type: string; subject_key: string; access: string }>;
  roles: Array<{ key: string; name_ar: string | null }>;
  templates: Array<{ id: string; name: string; is_global: boolean }>;
  versions: Array<{ id: string; version_no: number; status: string; label: string | null; created_at: string }>;
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
  const [{ data: cfgRows }, { data: accRows }, { data: secRows }, { data: secAccRows }, { data: roleRows }, { data: tplRows }, { data: verRows }] = await Promise.all([
    supabase.from('erp_field_config').select('*').eq('entity', entity),
    supabase.from('erp_field_access').select('field_key, subject_type, subject_key, access').eq('entity', entity),
    supabase.from('erp_field_sections').select('*').eq('entity', entity).order('sort'),
    supabase.from('erp_field_section_access').select('section_key, subject_type, subject_key, access').eq('entity', entity),
    supabase.from('erp_roles').select('key, name_ar').order('rank', { ascending: false }),
    supabase.from('erp_field_templates').select('id, name, is_global').eq('scope_entity', entity).order('created_at', { ascending: false }),
    supabase.from('erp_field_config_versions').select('id, version_no, status, label, created_at').eq('entity', entity).order('version_no', { ascending: false }),
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
    sectionAccess: (secAccRows ?? []) as Array<{ section_key: string; subject_type: string; subject_key: string; access: string }>,
    roles: (roleRows ?? []) as Array<{ key: string; name_ar: string | null }>,
    templates: (tplRows ?? []) as Array<{ id: string; name: string; is_global: boolean }>,
    versions: (verRows ?? []) as Array<{ id: string; version_no: number; status: string; label: string | null; created_at: string }>,
  };
}
