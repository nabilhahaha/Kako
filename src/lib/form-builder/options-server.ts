import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { allFields, type FormDefinition, type FormField } from './model';

// ============================================================================
// Form Builder — dynamic option resolution (Phase 8F-2). Resolves a field's
// `optionsSource` to live, per-tenant options (RLS-scoped) and returns a NEW
// definition with `options` filled, so the renderer shows real master data and
// the validator checks against the same set. The single place master-data
// options are loaded — no parallel option logic. Supports the FMCG customer
// lookups (segment/classification/channel) and erp_routes; extensible by table.
// ============================================================================

type Option = { value: string; label?: string; labelAr?: string };

async function loadLookup(supabase: SupabaseClient, kind: string): Promise<Option[]> {
  const { data } = await supabase
    .from('erp_customer_lookups')
    .select('id, name, name_ar')
    .eq('kind', kind)
    .eq('is_active', true)
    .order('sort', { ascending: true });
  return ((data as { id: string; name: string; name_ar: string | null }[] | null) ?? []).map((r) => ({
    value: r.id, label: r.name, labelAr: r.name_ar ?? r.name,
  }));
}

async function loadTable(supabase: SupabaseClient, table: string): Promise<Option[]> {
  // Only known master tables are resolvable (no arbitrary table reads).
  if (table !== 'erp_routes') return [];
  const { data } = await supabase
    .from('erp_routes')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true });
  return ((data as { id: string; name: string }[] | null) ?? []).map((r) => ({ value: r.id, label: r.name, labelAr: r.name }));
}

async function optionsFor(supabase: SupabaseClient, f: FormField): Promise<Option[] | null> {
  const src = f.optionsSource;
  if (!src) return null;
  if (src.lookup) return loadLookup(supabase, src.lookup);
  if (src.table) return loadTable(supabase, src.table);
  return [];
}

/** Return a copy of `def` with every optionsSource field's `options` resolved to
 *  live per-tenant values. Fields without an optionsSource pass through unchanged.
 *  RLS scopes the reads to the caller's company. */
export async function resolveFormOptions(supabase: SupabaseClient, def: FormDefinition): Promise<FormDefinition> {
  const dynamic = allFields(def).some((f) => f.optionsSource);
  if (!dynamic) return def;
  const byKey = new Map<string, Option[]>();
  await Promise.all(
    allFields(def)
      .filter((f) => f.optionsSource)
      .map(async (f) => { byKey.set(f.key, (await optionsFor(supabase, f)) ?? []); }),
  );
  return {
    sections: def.sections.map((s) => ({
      ...s,
      fields: s.fields.map((f) => (byKey.has(f.key) ? { ...f, options: byKey.get(f.key) } : f)),
    })),
  };
}
