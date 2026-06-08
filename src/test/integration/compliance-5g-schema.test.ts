import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Phase 5G — Global Tax Compliance Foundation schema additions (additive,
 * flag-gated, INERT). Verifies, against the live test DB built from migrations:
 * the full metadata + audit columns (0208) + widened lifecycle CHECK, the log
 * kinds/direction (0209), the status-change history table (0210), and the legal/
 * tax profile fields (0211). FK-coverage + RLS-wrap are enforced globally by
 * schema-health.test.ts. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('compliance · Phase 5G schema', () => {
  it('erp_tax_submissions gains the full metadata + audit columns', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='erp_tax_submissions'
          AND column_name IN ('external_invoice_number','internal_invoice_number','qr_reference',
            'submission_reference','clearance_reference','reporting_reference','provider_reference',
            'submission_timestamp','response_timestamp','created_by','modified_by','submitted_by','resubmissions')`);
      expect(rows).toHaveLength(13);
    } finally { await c.end().catch(() => {}); }
  });

  it('lifecycle CHECK includes the 5G states', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid='erp_tax_submissions'::regclass AND conname='erp_tax_submissions_status_chk'`);
      for (const s of ['validated', 'accepted', 'accepted_with_warning'])
        expect(rows[0].def).toContain(`'${s}'`);
    } finally { await c.end().catch(() => {}); }
  });

  it('erp_compliance_logs gains log_kind + direction with CHECKs', async () => {
    const c = await connect();
    try {
      const cols = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='erp_compliance_logs'
          AND column_name IN ('log_kind','direction')`);
      expect(cols.rows).toHaveLength(2);
      const chk = await c.query(`
        SELECT string_agg(pg_get_constraintdef(oid), ' ') AS defs FROM pg_constraint
        WHERE conrelid='erp_compliance_logs'::regclass AND contype='c'`);
      expect(chk.rows[0].defs).toContain("'status_change'");
      expect(chk.rows[0].defs).toContain("'outbound'");
    } finally { await c.end().catch(() => {}); }
  });

  it('status-change history table exists with RLS', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='erp_compliance_status_history'`);
      expect(rows).toHaveLength(1);
      expect(rows[0].relrowsecurity).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('legal entity + branch gain the profile fields', async () => {
    const c = await connect();
    try {
      const le = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='erp_legal_entities'
          AND column_name IN ('legal_name','trade_name','commercial_registration','vat_registration_number',
            'tax_registration_number','national_address','building_number','street','district','city',
            'province','postal_code','country_code','industry','tax_regime')`);
      expect(le.rows).toHaveLength(15);
      const br = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='erp_branches'
          AND column_name IN ('branch_legal_identifier','branch_tax_identifier','national_address',
            'building_number','street','district','postal_code','country_code')`);
      expect(br.rows).toHaveLength(8);
    } finally { await c.end().catch(() => {}); }
  });
});
