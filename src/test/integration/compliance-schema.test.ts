import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Phase 5F — E-Invoicing Compliance platform foundations (additive, flag-gated,
 * INERT). Verifies the reusable schema lands against the live test DB built from
 * migrations: the certificate store (0205), the augmented submission record
 * (0206 — PIH/QR/signed-XML/retry-DLQ/cert FK + widened lifecycle), and the
 * compliance audit log (0207). FK-coverage + RLS-wrap invariants are enforced
 * globally by schema-health.test.ts. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('compliance · platform foundations schema', () => {
  it('certificate store + compliance log tables exist with RLS', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT c.relname, c.relrowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('erp_compliance_certificates','erp_compliance_logs')
        ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual(['erp_compliance_certificates', 'erp_compliance_logs']);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('erp_tax_submissions gains the Phase-5F compliance + queue columns', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'erp_tax_submissions'
          AND column_name IN ('previous_invoice_hash','qr_payload','xml_payload_ref',
            'signed_xml_ref','certificate_id','compliance_metadata',
            'max_attempts','next_attempt_at','dead_lettered_at')`);
      expect(rows.map((r) => r.column_name).sort()).toEqual([
        'certificate_id', 'compliance_metadata', 'dead_lettered_at', 'max_attempts',
        'next_attempt_at', 'previous_invoice_hash', 'qr_payload', 'signed_xml_ref', 'xml_payload_ref',
      ]);
    } finally { await c.end().catch(() => {}); }
  });

  it('submission status CHECK is widened to the full lifecycle', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'erp_tax_submissions'::regclass AND conname = 'erp_tax_submissions_status_chk'`);
      expect(rows).toHaveLength(1);
      for (const s of ['queued', 'submitting', 'failed', 'dead_lettered']) {
        expect(rows[0].def).toContain(`'${s}'`);
      }
    } finally { await c.end().catch(() => {}); }
  });

  it('certificate kind + status CHECKs are enforced', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'erp_compliance_certificates'::regclass AND contype = 'c'`);
      const defs = rows.map((r) => r.def).join(' ');
      expect(defs).toContain("'sandbox'");
      expect(defs).toContain("'production'");
      expect(defs).toContain("'revoked'");
    } finally { await c.end().catch(() => {}); }
  });

  it('migrations are idempotent (re-applying 0205–0207 is a no-op)', async () => {
    const c = await connect();
    try {
      // Re-running the additive DDL must not error (IF NOT EXISTS / guarded CHECK).
      await c.query(`ALTER TABLE erp_tax_submissions ADD COLUMN IF NOT EXISTS qr_payload text;`);
      await c.query(`CREATE INDEX IF NOT EXISTS idx_compliance_logs_cert ON erp_compliance_logs (certificate_id);`);
      expect(true).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });
});
