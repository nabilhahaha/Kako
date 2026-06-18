'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { sanitizeTaxNumber, vatRateForCountry, type CountryVat } from './finance';

/**
 * Company Tax / VAT / Currency setup — server actions over `erp_companies`
 * (country, currency, tax_number) + the `erp_country_vat` reference table. No
 * new tables; RLS already scopes the company row to the caller's own company
 * (erp_companies_access). The action layer requires the company-config
 * capability (`settings.branches`) and audits writes.
 *
 * This is configuration only — no treasury / journal / tax-calculation engine is
 * touched, so the treasury baseline is preserved.
 */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null as null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'settings.branches')) return { ctx: null as null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

export interface CompanyFinance {
  country: string | null;
  currency: string | null;
  taxNumber: string | null;
  countries: CountryVat[];
  vatRate: number | null;   // standard VAT for the chosen country
}

export async function loadCompanyFinance(): Promise<Result<CompanyFinance>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();

  const [{ data: company, error: cErr }, { data: vatRows, error: vErr }] = await Promise.all([
    supabase.from('erp_companies').select('country, currency, tax_number').eq('id', ctx.companyId!).maybeSingle(),
    supabase.from('erp_country_vat').select('country, name_en, name_ar, vat_rate').eq('is_active', true).order('name_en', { ascending: true }),
  ]);
  if (cErr) return { ok: false, error: cErr.message };
  if (vErr) return { ok: false, error: vErr.message };

  const countries: CountryVat[] = ((vatRows as Record<string, unknown>[]) ?? []).map((r) => ({
    code: String(r.country), nameEn: String(r.name_en), nameAr: String(r.name_ar), vatRate: Number(r.vat_rate),
  }));
  const c = (company as { country: string | null; currency: string | null; tax_number: string | null } | null);

  return {
    ok: true,
    data: {
      country: c?.country ?? null,
      currency: c?.currency ?? null,
      taxNumber: c?.tax_number ?? null,
      countries,
      vatRate: vatRateForCountry(countries, c?.country ?? null),
    },
  };
}

export async function saveCompanyFinance(input: {
  country: string | null;
  currency: string | null;
  taxNumber: string | null;
}): Promise<Result<{ vatRate: number | null }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();

  // Validate country against the active reference list (no free text countries).
  const { data: vatRows, error: vErr } = await supabase
    .from('erp_country_vat').select('country, name_en, name_ar, vat_rate').eq('is_active', true);
  if (vErr) return { ok: false, error: vErr.message };
  const countries: CountryVat[] = ((vatRows as Record<string, unknown>[]) ?? []).map((r) => ({
    code: String(r.country), nameEn: String(r.name_en), nameAr: String(r.name_ar), vatRate: Number(r.vat_rate),
  }));
  const country = input.country && countries.some((c) => c.code === input.country) ? input.country : null;
  if (input.country && !country) return { ok: false, error: 'unknown_country' };

  const currency = (input.currency ?? '').trim().toUpperCase().slice(0, 8) || null;
  const taxNumber = input.taxNumber ? (sanitizeTaxNumber(input.taxNumber) || null) : null;

  const { error: upErr } = await supabase
    .from('erp_companies')
    .update({ country, currency, tax_number: taxNumber })
    .eq('id', ctx.companyId!);
  if (upErr) return { ok: false, error: upErr.message };

  await logAudit(supabase, {
    action: 'update', entity: 'company_finance', entityId: ctx.companyId,
    details: { country, currency, taxNumber }, companyId: ctx.companyId,
  });
  revalidatePath('/settings/finance');
  return { ok: true, data: { vatRate: vatRateForCountry(countries, country) } };
}
