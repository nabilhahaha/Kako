'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/erp/guards';
import { getFeatureFlags } from '@/lib/erp/feature-flags';

/**
 * ETA e-invoicing activation readiness. A read-only assessment of everything the
 * Egyptian Tax Authority integration needs before it can be switched on: issuer
 * registration + address, company tax number, per-line item codes, tax mapping
 * and the chosen environment. Surfaces each check with a pass/fail + guidance and
 * an overall readiness score so a tenant knows exactly what is left to activate.
 */

export interface ReadinessCheck {
  key: string;
  ok: boolean;
  /** A short current value/summary (e.g. "390 / 400"). */
  detail?: string;
  /** 'required' blocks activation; 'recommended' is advisory. */
  level: 'required' | 'recommended';
}

export interface EtaReadiness {
  enabled: boolean;
  environment: string | null;
  checks: ReadinessCheck[];
  requiredMet: number;
  requiredTotal: number;
  ready: boolean;
}

export async function etaReadiness(): Promise<EtaReadiness | null> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx?.companyId) return null;
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.eta_einvoicing'] !== true) return null;

  const [{ data: eta }, { data: company }, products] = await Promise.all([
    supabase.from('erp_company_eta_settings')
      .select('tax_registration_number, taxpayer_activity_code, issuer_name, environment, enabled, address')
      .eq('company_id', ctx.companyId).maybeSingle(),
    supabase.from('erp_companies').select('tax_number').eq('id', ctx.companyId).maybeSingle(),
    supabase.from('erp_products_catalog')
      .select('id, barcode, egs_code, tax_rate', { count: 'exact', head: false })
      .eq('company_id', ctx.companyId).eq('is_active', true),
  ]);

  const e = eta as { tax_registration_number: string | null; taxpayer_activity_code: string | null; issuer_name: string | null; environment: string | null; enabled: boolean; address: Record<string, string> | null } | null;
  const addr = e?.address ?? {};
  const tax = (company as { tax_number: string | null } | null)?.tax_number ?? null;
  const prods = (products.data as Array<{ barcode: string | null; egs_code: string | null; tax_rate: number | null }> | null) ?? [];
  const total = prods.length;
  const withItemCode = prods.filter((p) => (p.barcode && p.barcode.trim()) || (p.egs_code && p.egs_code.trim())).length;
  const withEgs = prods.filter((p) => p.egs_code && p.egs_code.trim()).length;
  const withTax = prods.filter((p) => p.tax_rate != null).length;
  const addrComplete = !!(addr.governate && addr.regionCity && addr.street && addr.buildingNumber);

  const checks: ReadinessCheck[] = [
    { key: 'tax_registration_number', ok: !!e?.tax_registration_number, level: 'required' },
    { key: 'taxpayer_activity_code', ok: !!e?.taxpayer_activity_code, level: 'required' },
    { key: 'issuer_name', ok: !!e?.issuer_name, level: 'required' },
    { key: 'issuer_address', ok: addrComplete, level: 'required' },
    { key: 'company_tax_number', ok: !!tax, level: 'required' },
    { key: 'item_codes', ok: total > 0 && withItemCode === total, detail: `${withItemCode} / ${total}`, level: 'required' },
    { key: 'tax_mapping', ok: total > 0 && withTax === total, detail: `${withTax} / ${total}`, level: 'required' },
    { key: 'environment', ok: !!e?.environment, detail: e?.environment ?? undefined, level: 'required' },
    { key: 'egs_codes', ok: total > 0 && withEgs === total, detail: `${withEgs} / ${total}`, level: 'recommended' },
  ];

  const required = checks.filter((c) => c.level === 'required');
  const requiredMet = required.filter((c) => c.ok).length;
  return {
    enabled: e?.enabled === true,
    environment: e?.environment ?? null,
    checks,
    requiredMet,
    requiredTotal: required.length,
    ready: requiredMet === required.length,
  };
}
