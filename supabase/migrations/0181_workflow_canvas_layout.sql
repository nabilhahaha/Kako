-- ============================================================================
-- 0181: Workflow Builder Phase 2 — canvas layout metadata (VISUAL ONLY)
-- ----------------------------------------------------------------------------
-- Additive, presentation-only columns for the drag-&-drop canvas. The runtime
-- NEVER reads these — execution stays owned by the event bus, workflow engine,
-- runtime and executors. No new engine, no new runtime, no business rules.
-- Depends on 0088 + 0176/0177/0178 (steps generalization) + 0180.
-- ============================================================================

-- Per-step canvas position: { "x": number, "y": number }. Nullable; when absent
-- the canvas auto-lays-out (so forms-authored workflows render immediately).
ALTER TABLE erp_workflow_steps ADD COLUMN IF NOT EXISTS ui_position jsonb;

-- Per-definition canvas metadata: { viewport:{x,y,zoom}, trigger:{x,y}, notes? }.
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS canvas_meta jsonb;

-- No FK / no covering index needed (not foreign keys). No RLS change: these
-- columns inherit each row's existing tenant policy.

-- Down (manual): drop the two added columns.
