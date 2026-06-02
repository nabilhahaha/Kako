-- ============================================================================
-- 0106: Pricing module — P-a (engine foundation)
-- ----------------------------------------------------------------------------
-- A standalone, deterministic price-resolution engine layered over the existing
-- base price (erp_products_catalog.sell_price), price lists (erp_price_lists /
-- _items) and wholesale tiers (erp_wholesale_tiers / _customer_tier = the S3
-- "price group"). Adds dimension-scoped price RULES, effective dating, a price
-- CHANGE LOG, and the resolver erp_resolve_price(). ADDITIVE; no existing pricing
-- behavior changes until the resolver is wired into order/invoice entry (P-b).
-- Promotion pricing is priority slot #1, filled by S5 (P-c) — a hook here.
--
-- Independent of the customer master: customers only carry segment/channel/branch;
-- the engine READS those to resolve a price. Owner-approved (all recommended):
-- single rule model · priority resolver · reuse lists+tiers · dedicated history ·
-- product-level now · manual override + audit (P-b) · phased P-a→P-b→P-c ·
-- dedicated pricing.manage permission.
-- ============================================================================

-- ── Price rules (dimension-scoped) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_price_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES erp_products_catalog(id) ON DELETE CASCADE,
  category_id UUID,                                   -- phase 2 (category rules); unused by P-a resolver
  scope_type  TEXT NOT NULL CHECK (scope_type IN ('customer','segment','channel','tier','branch','region','area','global')),
  scope_id    UUID,                                   -- the customer/segment/channel/tier/branch/region/area id (NULL for global)
  price_type  TEXT NOT NULL CHECK (price_type IN ('fixed','percent_off','amount_off')),
  value       NUMERIC(14,4) NOT NULL,
  min_qty     NUMERIC(14,3) NOT NULL DEFAULT 1,
  priority    INTEGER NOT NULL DEFAULT 0,             -- explicit tie-breaker (higher wins within a level)
  valid_from  DATE,
  valid_to    DATE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID,
  updated_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_price_rules_company ON erp_price_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_price_rules_product ON erp_price_rules(company_id, product_id);
CREATE INDEX IF NOT EXISTS idx_erp_price_rules_scope ON erp_price_rules(company_id, scope_type, scope_id);

-- ── Price change history (append-only) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_price_change_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  rule_id     UUID REFERENCES erp_price_rules(id) ON DELETE SET NULL,
  product_id  UUID,
  scope_type  TEXT,
  scope_id    UUID,
  price_type  TEXT,
  old_value   NUMERIC(14,4),
  new_value   NUMERIC(14,4),
  changed_by  UUID,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_price_change_log_company ON erp_price_change_log(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_price_change_log_product ON erp_price_change_log(company_id, product_id);

-- ── RLS + triggers (company_id + updated_at), same pattern as tenant tables ──
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_price_rules','erp_price_change_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_company ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_company BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_tenant" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_tenant" ON %I FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())', t, t);
  END LOOP;
  EXECUTE 'DROP TRIGGER IF EXISTS erp_price_rules_updated ON erp_price_rules';
  EXECUTE 'CREATE TRIGGER erp_price_rules_updated BEFORE UPDATE ON erp_price_rules FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';
END $$;

-- ── History trigger: log every rule value/price_type change ───────────────────
CREATE OR REPLACE FUNCTION erp_price_rules_log()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.value IS NOT DISTINCT FROM OLD.value
     AND NEW.price_type IS NOT DISTINCT FROM OLD.price_type THEN
    RETURN NEW;  -- nothing price-relevant changed
  END IF;
  INSERT INTO erp_price_change_log (company_id, rule_id, product_id, scope_type, scope_id, price_type, old_value, new_value, changed_by)
  VALUES (NEW.company_id, NEW.id, NEW.product_id, NEW.scope_type, NEW.scope_id, NEW.price_type,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.value ELSE NULL END, NEW.value, auth.uid());
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS erp_price_rules_history ON erp_price_rules;
CREATE TRIGGER erp_price_rules_history
  AFTER INSERT OR UPDATE ON erp_price_rules
  FOR EACH ROW EXECUTE FUNCTION erp_price_rules_log();

-- ── Resolver: deterministic price for (product, customer, branch, qty, date) ──
-- Priority (first match wins), each filtered by effective date + min_qty:
--   [1 promotion = S5 hook] 2 customer · 3 segment · 4 channel · 5 tier ·
--   6 branch · 7 area · 8 region · 9 global  →  then price list  →  base.
-- fixed = absolute unit price; percent_off / amount_off apply to the list price
-- (price-list price if any, else base sell_price). Tie-break: explicit priority
-- DESC, then latest valid_from.
CREATE OR REPLACE FUNCTION erp_resolve_price(
  p_product_id uuid, p_customer_id uuid, p_branch_id uuid DEFAULT NULL,
  p_qty numeric DEFAULT 1, p_at date DEFAULT CURRENT_DATE
)
RETURNS TABLE(price numeric, source text, rule_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid; v_seg uuid; v_chan uuid; v_branch uuid; v_region uuid; v_area uuid; v_tier uuid;
  v_base numeric; v_list numeric; v_listp numeric;
  r RECORD;
BEGIN
  SELECT company_id, segment_id, channel_id, COALESCE(p_branch_id, branch_id), region_id, area_id
    INTO v_company, v_seg, v_chan, v_branch, v_region, v_area
    FROM erp_customers WHERE id = p_customer_id;
  SELECT tier_id INTO v_tier FROM erp_wholesale_customer_tier WHERE customer_id = p_customer_id;
  SELECT sell_price INTO v_base FROM erp_products_catalog WHERE id = p_product_id;
  v_base := COALESCE(v_base, 0);

  -- List price: branch-specific list first, else default/global active list.
  SELECT pli.unit_price INTO v_list
  FROM erp_price_list_items pli JOIN erp_price_lists pl ON pl.id = pli.price_list_id
  WHERE pli.product_id = p_product_id AND pl.is_active
    AND (pl.branch_id = v_branch OR pl.branch_id IS NULL)
  ORDER BY (pl.branch_id = v_branch) DESC NULLS LAST, pl.is_default DESC
  LIMIT 1;
  v_listp := COALESCE(v_list, v_base);

  SELECT pr.* INTO r
  FROM erp_price_rules pr
  WHERE pr.company_id = v_company AND pr.is_active AND pr.product_id = p_product_id
    AND pr.min_qty <= p_qty
    AND (pr.valid_from IS NULL OR pr.valid_from <= p_at)
    AND (pr.valid_to IS NULL OR pr.valid_to >= p_at)
    AND (
         (pr.scope_type = 'customer' AND pr.scope_id = p_customer_id)
      OR (pr.scope_type = 'segment'  AND pr.scope_id IS NOT DISTINCT FROM v_seg AND v_seg IS NOT NULL)
      OR (pr.scope_type = 'channel'  AND pr.scope_id IS NOT DISTINCT FROM v_chan AND v_chan IS NOT NULL)
      OR (pr.scope_type = 'tier'     AND pr.scope_id IS NOT DISTINCT FROM v_tier AND v_tier IS NOT NULL)
      OR (pr.scope_type = 'branch'   AND pr.scope_id IS NOT DISTINCT FROM v_branch AND v_branch IS NOT NULL)
      OR (pr.scope_type = 'area'     AND pr.scope_id IS NOT DISTINCT FROM v_area AND v_area IS NOT NULL)
      OR (pr.scope_type = 'region'   AND pr.scope_id IS NOT DISTINCT FROM v_region AND v_region IS NOT NULL)
      OR (pr.scope_type = 'global')
    )
  ORDER BY
    CASE pr.scope_type
      WHEN 'customer' THEN 2 WHEN 'segment' THEN 3 WHEN 'channel' THEN 4 WHEN 'tier' THEN 5
      WHEN 'branch' THEN 6 WHEN 'area' THEN 7 WHEN 'region' THEN 8 WHEN 'global' THEN 9 ELSE 99 END ASC,
    pr.priority DESC, pr.valid_from DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    price := CASE r.price_type
               WHEN 'fixed'       THEN r.value
               WHEN 'percent_off' THEN ROUND(v_listp * (1 - r.value / 100.0), 2)
               WHEN 'amount_off'  THEN v_listp - r.value
               ELSE v_listp END;
    source := r.scope_type; rule_id := r.id; RETURN NEXT; RETURN;
  END IF;

  IF v_list IS NOT NULL THEN
    price := v_listp; source := 'price_list'; rule_id := NULL; RETURN NEXT; RETURN;
  END IF;
  price := v_base; source := 'base'; rule_id := NULL; RETURN NEXT; RETURN;
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_resolve_price(uuid, uuid, uuid, numeric, date) FROM anon;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_resolve_price(uuid, uuid, uuid, numeric, date);
-- DROP TRIGGER IF EXISTS erp_price_rules_history ON erp_price_rules;
-- DROP FUNCTION IF EXISTS erp_price_rules_log();
-- DROP TABLE IF EXISTS erp_price_change_log;
-- DROP TABLE IF EXISTS erp_price_rules;
