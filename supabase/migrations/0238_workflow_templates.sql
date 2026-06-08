-- ============================================================================
-- 0238: Workflow Builder (8A-1) — reusable approval-template catalog
-- ----------------------------------------------------------------------------
-- Business-process foundation (8A). A catalog of reusable workflow TEMPLATES that
-- a tenant clones into its own erp_workflow_definitions/_steps (cloning lands in a
-- later increment). Global templates (company_id IS NULL) are platform-seeded and
-- readable by every tenant; a tenant may also save its own. The `definition` jsonb
-- is a self-contained {entity, trigger, steps[]} the existing engine understands.
--
-- Additive + INERT until KAKO_WORKFLOW_BUILDER. Company-scoped RLS (+ global read).
-- No change to the existing workflow engine tables. Depends on 0088/0176 (engine).
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_workflow_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES erp_companies(id) ON DELETE CASCADE,  -- NULL = global seed
  code        text NOT NULL,
  name_en     text NOT NULL,
  name_ar     text NOT NULL,
  category    text NOT NULL CHECK (category IN
                ('customer','price','trade_spend','return','collection',
                 'purchase','credit','data_update','expiry','custom')),
  entity      text NOT NULL,
  definition  jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
-- FK-covering index (first column = FK column) + a global-catalog lookup.
CREATE INDEX IF NOT EXISTS idx_workflow_templates_company  ON erp_workflow_templates (company_id, category);
-- Partial UNIQUE on global codes so the platform seed is idempotent on re-apply
-- (the (company_id, code) UNIQUE treats NULL company_id as distinct).
CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_templates_global_code ON erp_workflow_templates (code) WHERE company_id IS NULL;

ALTER TABLE erp_workflow_templates ENABLE ROW LEVEL SECURITY;

-- Read: global seeds (company_id IS NULL) are visible to everyone; a tenant also
-- sees its own. Platform owner sees all.
DROP POLICY IF EXISTS erp_workflow_templates_read ON erp_workflow_templates;
CREATE POLICY erp_workflow_templates_read ON erp_workflow_templates FOR SELECT
  USING (company_id IS NULL OR erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Write: only a tenant's own rows (global seeds are platform-managed via migration);
-- platform owner may manage all.
DROP POLICY IF EXISTS erp_workflow_templates_write ON erp_workflow_templates;
CREATE POLICY erp_workflow_templates_write ON erp_workflow_templates FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Seed the global approval templates (incl. the 3 demo scenarios) ──────────
-- Each definition is {entity, trigger, steps:[{stepNo,stepType,name,approverType,
-- approverRef,mode,requiredApprovals,slaHours,escalateTo,config}]}. Idempotent.
INSERT INTO erp_workflow_templates (company_id, code, name_en, name_ar, category, entity, definition)
VALUES
 (NULL, 'customer_data_update', 'Customer Data Update Request', 'طلب تحديث بيانات العميل',
  'data_update', 'customer_change_request',
  '{"entity":"customer_change_request","trigger":"manual","steps":[
     {"stepNo":1,"stepType":"approval","name":"Supervisor review","approverType":"role","approverRef":"supervisor","mode":"sequential","requiredApprovals":1,"slaHours":24,"escalateTo":"manager","config":{}},
     {"stepNo":2,"stepType":"update_record","name":"Apply approved changes","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{}},
     {"stepNo":3,"stepType":"notification","name":"Notify requester","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{"channel":"in_app"}}
   ]}'::jsonb),
 (NULL, 'old_expiry_approval', 'Old / Near-Expiry Approval', 'اعتماد البضاعة قريبة الانتهاء',
  'expiry', 'inventory_expiry',
  '{"entity":"inventory_expiry","trigger":"manual","steps":[
     {"stepNo":1,"stepType":"condition","name":"Within expiry threshold","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{}},
     {"stepNo":2,"stepType":"approval","name":"Warehouse manager approval","approverType":"role","approverRef":"manager","mode":"sequential","requiredApprovals":1,"slaHours":48,"escalateTo":"admin","config":{}},
     {"stepNo":3,"stepType":"notification","name":"Notify stock controller","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{"channel":"in_app"}}
   ]}'::jsonb),
 (NULL, 'trade_spend_approval', 'Trade Spend Approval', 'اعتماد الإنفاق التجاري',
  'trade_spend', 'trade_promotion',
  '{"entity":"trade_promotion","trigger":"manual","steps":[
     {"stepNo":1,"stepType":"approval","name":"Sales manager approval","approverType":"role","approverRef":"manager","mode":"sequential","requiredApprovals":1,"slaHours":24,"escalateTo":"admin","config":{}},
     {"stepNo":2,"stepType":"condition","name":"Above cap → finance","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{}},
     {"stepNo":3,"stepType":"approval","name":"Finance approval (over cap)","approverType":"role","approverRef":"accountant","mode":"sequential","requiredApprovals":1,"slaHours":48,"escalateTo":"admin","config":{}},
     {"stepNo":4,"stepType":"notification","name":"Notify requester","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{"channel":"in_app"}}
   ]}'::jsonb)
ON CONFLICT (code) WHERE company_id IS NULL DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS erp_workflow_templates;
