'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import {
  validateTaxRegistration, sanitizeRegistrationNumber, type TaxRegistrationInput,
} from './tax-registration';
import type { CountryVat } from './finance';

/**
 * Tax registrations — server actions over the existing `erp_tax_registrations`
 * table. The company's default legal entity (`erp_legal_entities`) is
 * auto-provisioned on first use from the company's own basics, so a
 * non-technical admin only ever manages "tax registrations". No new tables, no
 * migration. RLS scopes both tables to the company. Configuration records only —
 * the treasury / tax-calculation baseline is untouched. Gated on settings.branches.
 */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }
type Db = Awaited<ReturnType<typeof createClient>>;

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null as null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'settings.branches')) return { ctx: null as null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

export interface TaxRegistrationRow {
  id: string;
  country: string;
  taxKind: string;
  registrationNumber: string;
  isDefault: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface TaxRegistrationData {
  registrations: TaxRegistrationRow[];
  countries: CountryVat[];
  companyCountry: string | null;
}

/** Find or lazily create the company's default legal entity (kept invisible to
 *  the admin — seeded from the company's own basics). Returns its id. */
async function ensureDefaultLegalEntity(supabase: Db, companyId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('erp_legal_entities')
    .select('id')
    .eq('company_id', companyId)
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return String((existing as { id: string }).id);

  const { data: company } = await supabase
    .from('erp_companies').select('name, country, currency').eq('id', companyId).maybeSingle();
  const c = company as { name?: string; country?: string | null; currency?: string | null } | null;

  const { data: created, error } = await supabase
    .from('erp_legal_entities')
    .insert({
      company_id: companyId,
      name: c?.name || 'Default',
      country: c?.country ?? null,
      base_currency: c?.currency ?? null,
      is_default: true,
      status: 'active',
    })
    .select('id')
    .single();
  if (error) return null;
  return String((created as { id: string }).id);
}

export async function loadTaxRegistrations(): Promise<Result<TaxRegistrationData>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();

  const [{ data: regs, error: rErr }, { data: vat, error: vErr }, { data: company }] = await Promise.all([
    supabase
      .from('erp_tax_registrations')
      .select('id, country, tax_kind, registration_number, is_default, effective_from, effective_to')
      .eq('company_id', ctx.companyId!)
      .order('is_default', { ascending: false }),
    supabase.from('erp_country_vat').select('country, name_en, name_ar, vat_rate').eq('is_active', true).order('name_en'),
    supabase.from('erp_companies').select('country').eq('id', ctx.companyId!).maybeSingle(),
  ]);
  if (rErr) return { ok: false, error: rErr.message };
  if (vErr) return { ok: false, error: vErr.message };

  return {
    ok: true,
    data: {
      registrations: ((regs as Record<string, unknown>[]) ?? []).map((r) => ({
        id: String(r.id), country: String(r.country ?? ''), taxKind: String(r.tax_kind ?? 'vat'),
        registrationNumber: String(r.registration_number ?? ''), isDefault: Boolean(r.is_default),
        effectiveFrom: (r.effective_from as string) ?? null, effectiveTo: (r.effective_to as string) ?? null,
      })),
      countries: ((vat as Record<string, unknown>[]) ?? []).map((r) => ({
        code: String(r.country), nameEn: String(r.name_en), nameAr: String(r.name_ar), vatRate: Number(r.vat_rate),
      })),
      companyCountry: (company as { country: string | null } | null)?.country ?? null,
    },
  };
}

export async function saveTaxRegistration(input: {
  id?: string;
  country: string | null;
  taxKind: string;
  registrationNumber: string;
  isDefault: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };

  const candidate: TaxRegistrationInput = {
    country: input.country, taxKind: input.taxKind, registrationNumber: input.registrationNumber,
    effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo,
  };
  const problems = validateTaxRegistration(candidate);
  if (problems.length) return { ok: false, error: problems[0] };

  const supabase = await createClient();
  const legalEntityId = await ensureDefaultLegalEntity(supabase, ctx.companyId!);
  if (!legalEntityId) return { ok: false, error: 'legal_entity_failed' };

  const payload = {
    company_id: ctx.companyId!,
    legal_entity_id: legalEntityId,
    country: input.country,
    tax_kind: input.taxKind,
    registration_number: sanitizeRegistrationNumber(input.registrationNumber),
    is_default: input.isDefault,
    effective_from: input.effectiveFrom || null,
    effective_to: input.effectiveTo || null,
  };

  // Only one default per company: clear others when this one is the default.
  if (input.isDefault) {
    await supabase.from('erp_tax_registrations').update({ is_default: false }).eq('company_id', ctx.companyId!);
  }

  let id = input.id;
  if (id) {
    const { error: upErr } = await supabase.from('erp_tax_registrations').update(payload).eq('id', id);
    if (upErr) return { ok: false, error: upErr.message };
  } else {
    const { data, error: insErr } = await supabase.from('erp_tax_registrations').insert(payload).select('id').single();
    if (insErr) return { ok: false, error: insErr.message };
    id = String((data as { id: string }).id);
  }

  await logAudit(supabase, {
    action: input.id ? 'update' : 'create', entity: 'tax_registration', entityId: id,
    companyId: ctx.companyId, details: { taxKind: input.taxKind, country: input.country },
  });
  revalidatePath('/settings/tax-registrations');
  return { ok: true, data: { id } };
}

export async function deleteTaxRegistration(input: { id: string }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!input.id) return { ok: false, error: 'missing' };
  const supabase = await createClient();
  const { error: delErr } = await supabase.from('erp_tax_registrations').delete().eq('id', input.id);
  if (delErr) return { ok: false, error: delErr.message };
  await logAudit(supabase, { action: 'delete', entity: 'tax_registration', entityId: input.id, companyId: ctx.companyId });
  revalidatePath('/settings/tax-registrations');
  return { ok: true };
}
