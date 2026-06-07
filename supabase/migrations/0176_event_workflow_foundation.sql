-- ============================================================================
-- 0176: Event Bus + Workflow Engine generalization (Constitution P0-01)
-- ----------------------------------------------------------------------------
-- ONE workflow engine, ONE event bus, ZERO duplicate logic (founder decision +
-- Constitution Art. 04/06). This does NOT create a second engine. It:
--   1. Adds erp_events — the new shared, append-only Event Bus (Art. 43).
--   2. Extends the EXISTING engine (erp_workflow_definitions / _steps / _instances
--      / _tasks from 0088–0090/0122) additively for: generic event triggers,
--      Workflow-Builder compatibility, generic step types, and branch-awareness.
--
-- The legacy engine is already entity-agnostic with conditional routing, dynamic
-- approver resolution (role/manager/department_head), parallel/quorum, SLA timers,
-- escalation (erp_workflow_tick), amount routing and notifications — so those are
-- NOT re-added. Every change here is ADD COLUMN IF NOT EXISTS with behaviour-
-- preserving defaults; no existing column, RPC, policy, or business logic is
-- modified. Additive + idempotent.
--
-- Depends on: 0018 (erp_is_platform_owner, erp_user_company_id, erp_set_company_id),
-- erp_set_updated_at, and 0088 workflow tables.
-- ============================================================================

-- ─── 1. erp_events — shared append-only Event Bus (NEW) ──────────────────────
CREATE TABLE IF NOT EXISTS erp_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id    UUID REFERENCES erp_branches(id) ON DELETE SET NULL,   -- null = company-level
  event_type   TEXT NOT NULL,                        -- e.g. 'invoice.issued', 'customer.created'
  entity       TEXT NOT NULL,                         -- neutral entity key (matches workflow 'entity')
  record_id    TEXT,                                  -- affected record (text, like workflow record_id)
  payload      JSONB NOT NULL DEFAULT '{}'::JSONB,
  actor_id     UUID,                                  -- auth.uid() that caused it (audit)
  source       TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','workflow','integration','sync','system')),
  dedupe_key   TEXT,                                  -- optional emitter idempotency
  seq          BIGSERIAL,                             -- monotonic per-table feed cursor
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_events_feed         ON erp_events (company_id, seq);
CREATE INDEX IF NOT EXISTS idx_erp_events_entity       ON erp_events (company_id, entity, record_id);
CREATE INDEX IF NOT EXISTS idx_erp_events_type         ON erp_events (company_id, event_type, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_events_dedupe ON erp_events (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- multi-tenant auto-fill + RLS (same pattern as the rest of the platform)
DROP TRIGGER IF EXISTS erp_events_set_company ON erp_events;
CREATE TRIGGER erp_events_set_company BEFORE INSERT ON erp_events FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();

ALTER TABLE erp_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp_events_tenant" ON erp_events;
CREATE POLICY "erp_events_tenant" ON erp_events FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ─── 2. Extend erp_workflow_definitions — event triggers + builder + branch ──
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS trigger_event  TEXT;                       -- event_type that auto-starts this workflow
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS trigger_config JSONB NOT NULL DEFAULT '{}'::JSONB;  -- event filter/condition (Art. 10)
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS description    TEXT;
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS version        INT NOT NULL DEFAULT 1;
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS builder_schema JSONB NOT NULL DEFAULT '{}'::JSONB;  -- canvas layout for Workflow Builder UI
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS branch_id      UUID REFERENCES erp_branches(id) ON DELETE SET NULL; -- null = company-wide
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS created_by     UUID;
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS updated_by     UUID;
CREATE INDEX IF NOT EXISTS idx_erp_wf_def_trigger ON erp_workflow_definitions (company_id, trigger_event) WHERE trigger_event IS NOT NULL;

-- ─── 3. Extend erp_workflow_steps — generic step types + builder branching ───
-- Existing rows are approval steps → default 'approval' keeps current behaviour.
ALTER TABLE erp_workflow_steps ADD COLUMN IF NOT EXISTS step_type       TEXT NOT NULL DEFAULT 'approval';
ALTER TABLE erp_workflow_steps ADD COLUMN IF NOT EXISTS name            TEXT;       -- builder-friendly label (alongside name_ar/name_en)
ALTER TABLE erp_workflow_steps ADD COLUMN IF NOT EXISTS config          JSONB NOT NULL DEFAULT '{}'::JSONB; -- step-type-specific (task/notification/api_call/...)
ALTER TABLE erp_workflow_steps ADD COLUMN IF NOT EXISTS next_on_success UUID;       -- explicit builder branching (-> step id)
ALTER TABLE erp_workflow_steps ADD COLUMN IF NOT EXISTS next_on_failure UUID;
-- add the step_type CHECK once (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erp_workflow_steps_step_type_chk') THEN
    ALTER TABLE erp_workflow_steps ADD CONSTRAINT erp_workflow_steps_step_type_chk
      CHECK (step_type IN ('condition','approval','task','notification','api_call','update_record','delay','escalation'));
  END IF;
END $$;

-- ─── 4. Extend erp_workflow_instances — event provenance + branch-awareness ──
ALTER TABLE erp_workflow_instances ADD COLUMN IF NOT EXISTS branch_id        UUID REFERENCES erp_branches(id) ON DELETE SET NULL;
ALTER TABLE erp_workflow_instances ADD COLUMN IF NOT EXISTS trigger_event_id UUID REFERENCES erp_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_erp_wf_inst_event ON erp_workflow_instances (trigger_event_id) WHERE trigger_event_id IS NOT NULL;

-- ─── 5. Extend erp_workflow_tasks — branch-awareness ─────────────────────────
ALTER TABLE erp_workflow_tasks ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES erp_branches(id) ON DELETE SET NULL;

-- Down (manual): drop table erp_events; drop the ADD COLUMNs above; drop constraint
--                erp_workflow_steps_step_type_chk. (No existing logic was changed.)
