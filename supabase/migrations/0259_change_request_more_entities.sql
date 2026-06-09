-- ============================================================================
-- 0259: Change Request engine — Phase 11: register more entities (product/supplier/route)
-- ----------------------------------------------------------------------------
-- Proves the platform claim: governing a NEW master-data entity is METADATA, not
-- engine code. Adds three global entities (Products, Suppliers, Routes) — each is
-- a registry row + an allowlist row + a default workflow. Vehicles/Salesmen have
-- no master table yet; a future module/pack registers them the same way.
--
-- Also makes the apply allowlist DATA-DRIVEN: erp_change_request_apply_tables is
-- the seedable list of tables the engine may write to (independent of the registry
-- so a tenant can never point the engine at an arbitrary table). The apply function
-- is refreshed to consult it. Additive; INERT until KAKO_CHANGE_REQUESTS.
-- ============================================================================

-- ── Data-driven apply allowlist (seeded by migrations only) ─────────────────
CREATE TABLE IF NOT EXISTS erp_change_request_apply_tables (
  table_name text PRIMARY KEY
);
ALTER TABLE erp_change_request_apply_tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_cr_apply_tables_read ON erp_change_request_apply_tables;
CREATE POLICY erp_cr_apply_tables_read ON erp_change_request_apply_tables FOR SELECT USING (true);
-- No tenant write path: the list is seeded by migrations (owner) only.
INSERT INTO erp_change_request_apply_tables(table_name) VALUES
  ('erp_customers'), ('erp_products_catalog'), ('erp_suppliers'), ('erp_routes')
ON CONFLICT DO NOTHING;

-- ── Refresh apply to consult the allowlist table (was a hardcoded array) ────
CREATE OR REPLACE FUNCTION erp_change_request_apply(p_request_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  r            erp_change_requests%ROWTYPE;
  v_table      text;
  v_idcol      text;
  t            record;
  vrow         record;
  v_udt        text;
  v_old_row    jsonb;
  v_before     jsonb;
  v_after      jsonb;
  v_total      int := 0;
  v_applied    int := 0;
  v_failed     int := 0;
  v_final      text;
BEGIN
  SELECT * INTO r FROM erp_change_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'change request % not found', p_request_id; END IF;

  IF r.status NOT IN ('approved', 'scheduled', 'applying') THEN
    RETURN r.status;
  END IF;

  IF r.effective_at IS NOT NULL AND r.effective_at > now() THEN
    UPDATE erp_change_requests SET status = 'scheduled' WHERE id = p_request_id AND status <> 'scheduled';
    RETURN 'scheduled';
  END IF;

  SELECT target_table, COALESCE(id_column, 'id') INTO v_table, v_idcol
  FROM erp_change_request_entities
  WHERE entity_key = r.entity_key AND (company_id = r.company_id OR company_id IS NULL) AND is_active
  ORDER BY (company_id IS NULL)
  LIMIT 1;
  IF v_table IS NULL THEN RAISE EXCEPTION 'change request entity % is not registered', r.entity_key; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_change_request_apply_tables WHERE table_name = v_table) THEN
    RAISE EXCEPTION 'table % is not in the change-request apply allowlist', v_table;
  END IF;

  UPDATE erp_change_requests SET status = 'applying' WHERE id = p_request_id;

  FOR t IN SELECT * FROM erp_change_request_targets WHERE request_id = p_request_id AND status = 'pending' LOOP
    v_total := v_total + 1;
    BEGIN
      EXECUTE format('SELECT to_jsonb(x) FROM %I x WHERE x.%I::text = $1 AND x.company_id = $2', v_table, v_idcol)
        INTO v_old_row USING t.target_id, r.company_id;
      IF v_old_row IS NULL THEN
        UPDATE erp_change_request_targets SET status = 'failed', error = 'target_not_found' WHERE id = t.id;
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      v_before := '{}'::jsonb;
      v_after  := '{}'::jsonb;

      FOR vrow IN
        SELECT field_key, new_value
        FROM erp_change_request_values
        WHERE request_id = p_request_id AND (target_id IS NULL OR target_id = t.target_id)
      LOOP
        SELECT udt_name INTO v_udt FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_table AND column_name = vrow.field_key;
        IF v_udt IS NULL THEN RAISE EXCEPTION 'field % is not a column of %', vrow.field_key, v_table; END IF;

        EXECUTE format('UPDATE %I SET %I = $1::%s WHERE %I::text = $2 AND company_id = $3',
                       v_table, vrow.field_key, v_udt, v_idcol)
          USING (vrow.new_value #>> '{}'), t.target_id, r.company_id;

        v_before := v_before || jsonb_build_object(vrow.field_key, v_old_row -> vrow.field_key);
        v_after  := v_after  || jsonb_build_object(vrow.field_key, vrow.new_value);
        UPDATE erp_change_request_values
          SET old_value = v_old_row -> vrow.field_key
          WHERE request_id = p_request_id AND field_key = vrow.field_key AND target_id = t.target_id;
      END LOOP;

      PERFORM erp_log_audit('change_request.apply', 'change_request', p_request_id::text,
        jsonb_build_object('entity_key', r.entity_key, 'target_id', t.target_id, 'before', v_before, 'after', v_after),
        r.company_id);

      UPDATE erp_change_request_targets SET status = 'applied', applied_at = now() WHERE id = t.id;
      v_applied := v_applied + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE erp_change_request_targets SET status = 'failed', error = left(SQLERRM, 500) WHERE id = t.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  v_final := CASE
    WHEN v_total = 0 THEN 'applied'
    WHEN v_failed = 0 THEN 'applied'
    WHEN v_applied = 0 THEN 'failed'
    ELSE 'partially_applied'
  END;
  UPDATE erp_change_requests SET status = v_final, applied_at = now() WHERE id = p_request_id;
  RETURN v_final;
END
$$;
REVOKE ALL ON FUNCTION erp_change_request_apply(uuid) FROM PUBLIC;

-- ── Register the entities (global metadata) ─────────────────────────────────
INSERT INTO erp_change_request_entities (
  company_id, entity_key, target_table, id_column, label_en, label_ar,
  create_permission, approve_permission, allowed_fields, validation, attachment_types, is_active
) VALUES
  (NULL, 'product', 'erp_products_catalog', 'id', 'Product', 'المنتج',
   'product.create', 'product.create',
   '["name","name_ar","barcode","category_id","unit","cost_price","sell_price","min_stock","tax_rate","description"]'::jsonb,
   '{"rules":[{"field":"sell_price","type":"number","min":0},{"field":"cost_price","type":"number","min":0}]}'::jsonb,
   '[]'::jsonb, true),
  (NULL, 'supplier', 'erp_suppliers', 'id', 'Supplier', 'المورّد',
   'suppliers.manage', 'suppliers.manage',
   '["name","name_ar","phone","email","address","city","tax_number"]'::jsonb,
   '{"rules":[{"field":"tax_number","regex":"^3[0-9]{14}$"}]}'::jsonb,
   '["cr_copy","vat_certificate"]'::jsonb, true),
  (NULL, 'route', 'erp_routes', 'id', 'Route', 'خط السير',
   'route.create', 'route.create',
   '["name","rep_id","van_warehouse_id","visit_day"]'::jsonb,
   '{}'::jsonb, '[]'::jsonb, true)
ON CONFLICT (entity_key) WHERE company_id IS NULL DO NOTHING;

-- ── Default approval workflows (one per entity; manager approves) ────────────
INSERT INTO erp_workflow_definitions
  (company_id, key, entity, name_ar, name_en, is_active, status, visibility, trigger, trigger_event, trigger_config)
SELECT NULL, 'change_request:' || k, 'change_request', n_ar, n_en, true, 'published', 'global', 'event',
       'change_request.submitted', jsonb_build_object('where', jsonb_build_object('entity_key', k))
FROM (VALUES
  ('product',  'طلب تغيير منتج',  'Product change request'),
  ('supplier', 'طلب تغيير مورّد', 'Supplier change request'),
  ('route',    'طلب تغيير خط سير','Route change request')
) AS e(k, n_ar, n_en)
ON CONFLICT (company_id, key) DO UPDATE SET
  is_active = true, status = 'published', visibility = 'global',
  trigger = 'event', trigger_event = EXCLUDED.trigger_event,
  trigger_config = EXCLUDED.trigger_config, entity = EXCLUDED.entity;

INSERT INTO erp_workflow_steps
  (definition_id, step_no, step_type, name, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, sla_hours, escalate_to, config)
SELECT d.id, s.step_no, s.step_type, s.name, s.name_ar, s.name_en, s.approver_type, s.approver_ref, s.mode, s.required_approvals, s.sla_hours, s.escalate_to, s.config
FROM erp_workflow_definitions d
CROSS JOIN (VALUES
  (1, 'approval',      'Approve change request', 'اعتماد طلب التغيير', 'Approve change request', 'role',     'manager', 'sequential', 1, 24,        'manager', '{}'::jsonb),
  (2, 'update_record', 'Mark request approved',  'تحديث حالة الطلب',   'Mark request approved',  NULL::text, NULL::text,'sequential', 1, NULL::int, NULL::text, '{"table":"erp_change_requests","patch":{"status":"approved"}}'::jsonb),
  (3, 'notification',  'Notify requester',       'إشعار صاحب الطلب',   'Notify requester',       NULL::text, NULL::text,'sequential', 1, NULL::int, NULL::text, '{"channel":"in_app","template":"change_request_decided","to":"requester"}'::jsonb)
) AS s(step_no, step_type, name, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, sla_hours, escalate_to, config)
WHERE d.company_id IS NULL AND d.key IN ('change_request:product', 'change_request:supplier', 'change_request:route')
ON CONFLICT (definition_id, step_no) DO NOTHING;

-- ── Rollback (manual): delete the seeded defs/steps/entities/allowlist rows. ──
