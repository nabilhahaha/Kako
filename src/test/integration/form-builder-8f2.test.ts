import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';
import { validateFormDefinition, type FormDefinition } from '@/lib/form-builder';

/**
 * Form Builder 8F-2 — the seeded global Customer Data Update form (0241) exists
 * with a PUBLISHED v1 whose schema is a well-formed FormDefinition, and the
 * customer_data_update workflow template references it via config.form_code.
 * Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('form-builder 8F-2 · customer data update seed', () => {
  it('global form + published v1 with a valid schema', async () => {
    const c = await connect();
    try {
      const form = await c.query(
        `SELECT id, entity FROM erp_forms WHERE code='customer_data_update' AND company_id IS NULL`,
      );
      expect(form.rows.length).toBe(1);
      expect(form.rows[0].entity).toBe('customer');

      const ver = await c.query(
        `SELECT version, schema, status FROM erp_form_versions WHERE form_id=$1 ORDER BY version DESC LIMIT 1`,
        [form.rows[0].id],
      );
      expect(ver.rows.length).toBe(1);
      expect(ver.rows[0].status).toBe('published');
      expect(ver.rows[0].version).toBe(1);

      const schema = ver.rows[0].schema as FormDefinition;
      expect(validateFormDefinition(schema)).toEqual([]);
      const keys = schema.sections.flatMap((s) => s.fields.map((f) => f.key));
      expect(keys).toContain('reason');
      expect(keys).toContain('national_address');
    } finally { await c.end().catch(() => {}); }
  });

  it('workflow template references the form by code', async () => {
    const c = await connect();
    try {
      const tpl = await c.query(
        `SELECT definition #>> '{steps,0,config,form_code}' AS form_code
           FROM erp_workflow_templates WHERE code='customer_data_update' AND company_id IS NULL`,
      );
      expect(tpl.rows.length).toBe(1);
      expect(tpl.rows[0].form_code).toBe('customer_data_update');
    } finally { await c.end().catch(() => {}); }
  });
});
