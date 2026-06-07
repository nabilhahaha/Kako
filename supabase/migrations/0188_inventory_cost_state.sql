-- ============================================================================
-- 0188: Inventory Foundation — costing state (Phase 1)
-- ----------------------------------------------------------------------------
-- Persistent state for the pure costing engine added in #145 (FIFO /
-- Weighted-Average / Standard), per approved arch #132 §1/§8A. State is owned by
-- the inventory domain and scoped per (warehouse, product) — cost is a per-location
-- attribute — mirroring the warehouse→branch RLS of erp_inventory_stock /
-- erp_stock_movements (erp_user_branch_ids()).
--
--   * erp_inventory_cost_state  — moving-average running (qty_on_hand, avg_cost)
--   * erp_inventory_cost_layers — FIFO cost lots (remaining_qty, unit_cost), oldest-first
--   * erp_standard_costs        — standard cost per (warehouse, product), effective-dated
--   * erp_stock_movements.unit_cost / total_cost — the VALUED cost of each movement
--     (the amount the Finance engine will post: Dr COGS/Cr Inventory on issue,
--     Dr Inventory/Cr GR-IR on receipt). Nullable + additive.
--
-- Additive + INERT: no triggers, no backfill, nothing writes these yet. The
-- costing SERVICE (next increment) populates them only when KAKO_INVENTORY_COSTING
-- is ON; GL posting is gated behind KAKO_FINANCE. No behaviour change at OFF.
-- Depends on 0005 (erp_warehouses/_products_catalog/_stock_movements, erp_user_branch_ids()).
-- ============================================================================

-- ── Moving-average running state ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_inventory_cost_state (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id  uuid NOT NULL REFERENCES erp_warehouses(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES erp_products_catalog(id) ON DELETE CASCADE,
  method        text NOT NULL DEFAULT 'moving_average'
                  CHECK (method IN ('moving_average','fifo','standard')),
  qty_on_hand   numeric(18,4) NOT NULL DEFAULT 0,
  avg_cost      numeric(18,4) NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_inv_cost_state_product ON erp_inventory_cost_state (product_id);

-- ── FIFO cost layers (lots) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_inventory_cost_layers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id      uuid NOT NULL REFERENCES erp_warehouses(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES erp_products_catalog(id) ON DELETE CASCADE,
  remaining_qty     numeric(18,4) NOT NULL,
  unit_cost         numeric(18,4) NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  source_movement_id uuid REFERENCES erp_stock_movements(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
-- oldest-first consumption + skip exhausted layers
CREATE INDEX IF NOT EXISTS idx_inv_cost_layers_fifo
  ON erp_inventory_cost_layers (warehouse_id, product_id, received_at)
  WHERE remaining_qty > 0;
-- covering indexes for the FK columns not led by the composite above (schema-health invariant)
CREATE INDEX IF NOT EXISTS idx_inv_cost_layers_product  ON erp_inventory_cost_layers (product_id);
CREATE INDEX IF NOT EXISTS idx_inv_cost_layers_movement ON erp_inventory_cost_layers (source_movement_id);

-- ── Standard costs (effective-dated, per warehouse+product) ──────────────────
CREATE TABLE IF NOT EXISTS erp_standard_costs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id   uuid NOT NULL REFERENCES erp_warehouses(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES erp_products_catalog(id) ON DELETE CASCADE,
  standard_cost  numeric(18,4) NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_standard_costs_lookup
  ON erp_standard_costs (warehouse_id, product_id, effective_from DESC);
-- covering index for the product_id FK (composite above is led by warehouse_id)
CREATE INDEX IF NOT EXISTS idx_standard_costs_product ON erp_standard_costs (product_id);

-- ── Valued cost on each movement (additive, nullable) ────────────────────────
ALTER TABLE erp_stock_movements ADD COLUMN IF NOT EXISTS unit_cost  numeric(18,4);
ALTER TABLE erp_stock_movements ADD COLUMN IF NOT EXISTS total_cost numeric(18,4);

-- ── RLS: warehouse→branch, mirroring erp_inventory_stock ─────────────────────
ALTER TABLE erp_inventory_cost_state  ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_inventory_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_standard_costs        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_inv_cost_state_manage ON erp_inventory_cost_state;
CREATE POLICY erp_inv_cost_state_manage ON erp_inventory_cost_state FOR ALL
  USING (warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids())))
  WITH CHECK (warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids())));

DROP POLICY IF EXISTS erp_inv_cost_layers_manage ON erp_inventory_cost_layers;
CREATE POLICY erp_inv_cost_layers_manage ON erp_inventory_cost_layers FOR ALL
  USING (warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids())))
  WITH CHECK (warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids())));

DROP POLICY IF EXISTS erp_standard_costs_manage ON erp_standard_costs;
CREATE POLICY erp_standard_costs_manage ON erp_standard_costs FOR ALL
  USING (warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids())))
  WITH CHECK (warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids())));
