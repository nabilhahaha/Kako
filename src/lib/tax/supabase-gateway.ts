// ============================================================================
// Global Tax — Supabase implementation of the TaxGateway (0197 lines/ledger, 0198
// profiles, 0200 determination rules). Thin DB adapter under the caller's RLS.
// server-only.
// ============================================================================

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { TaxGateway, TaxDocLineWrite, TaxLedgerWrite } from './gateway';
import type { DeterminationRule } from './determine';

type Db = Awaited<ReturnType<typeof createClient>>;

export function createSupabaseTaxGateway(db: Db): TaxGateway {
  return {
    async loadDeterminationRules(companyId) {
      const { data } = await db.from('erp_tax_determination_rules')
        .select('id, country, legal_entity_id, vat_registration_id, customer_type, customer_classification, channel, document_type, product_tax_code, product_category, transaction_type, document_tax_profile_id, vat_treatment, tax_code, tax_rate, compliance_requirement, country_pack, reporting_category, priority, effective_from, effective_to')
        .or(`company_id.is.null,company_id.eq.${companyId}`).eq('is_active', true);
      return ((data ?? []) as Array<Record<string, unknown>>).map((r): DeterminationRule => ({
        id: r.id as string,
        country: (r.country as string | null) ?? null,
        legalEntityId: (r.legal_entity_id as string | null) ?? null,
        vatRegistrationId: (r.vat_registration_id as string | null) ?? null,
        customerType: (r.customer_type as string | null) ?? null,
        customerClassification: (r.customer_classification as string | null) ?? null,
        channel: (r.channel as string | null) ?? null,
        documentType: (r.document_type as string | null) ?? null,
        productTaxCode: (r.product_tax_code as string | null) ?? null,
        productCategory: (r.product_category as string | null) ?? null,
        transactionType: (r.transaction_type as string | null) ?? null,
        profileCode: (r.document_tax_profile_id as string | null) ?? '', // resolved code via join in a richer impl; id placeholder
        vatTreatment: (r.vat_treatment as string | null) ?? null,
        taxCode: (r.tax_code as string | null) ?? null,
        taxRate: r.tax_rate != null ? Number(r.tax_rate) : null,
        complianceRequirement: (r.compliance_requirement as string | null) ?? null,
        countryPack: (r.country_pack as string | null) ?? null,
        reportingCategory: (r.reporting_category as string | null) ?? null,
        priority: (r.priority as number) ?? 100,
        effectiveFrom: (r.effective_from as string | null) ?? null,
        effectiveTo: (r.effective_to as string | null) ?? null,
      }));
    },

    async resolveProfileId(companyId, profileCode) {
      const { data } = await db.from('erp_document_tax_profiles')
        .select('id').eq('code', profileCode).or(`company_id.is.null,company_id.eq.${companyId}`)
        .order('company_id', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      return data ? (data as { id: string }).id : null;
    },

    async saveTaxDocumentLines(lines: TaxDocLineWrite[]) {
      if (lines.length === 0) return;
      await db.from('erp_tax_document_lines').insert(lines.map((l) => ({
        reference_type: l.referenceType, reference_id: l.referenceId, line_no: l.lineNo,
        base: l.base, tax_code: l.taxCode, rate: l.rate, tax_amount: l.taxAmount, kind: l.kind,
        inclusive: l.inclusive, document_tax_profile_id: l.documentTaxProfileId,
      })));
    },

    async saveTaxLedger(entries: TaxLedgerWrite[]) {
      if (entries.length === 0) return;
      await db.from('erp_tax_ledger').insert(entries.map((e) => ({
        legal_entity_id: e.legalEntityId, registration_id: e.registrationId, period: e.period,
        direction: e.direction, tax_code: e.taxCode, base: e.base, tax: e.tax,
        document_tax_profile_id: e.documentTaxProfileId, reporting_category: e.reportingCategory,
        reference_type: e.referenceType, reference_id: e.referenceId,
      })));
    },

    async hasAssessment(referenceType, referenceId) {
      const { data } = await db.from('erp_tax_document_lines')
        .select('id').eq('reference_type', referenceType).eq('reference_id', referenceId).limit(1).maybeSingle();
      return !!data;
    },
  };
}
