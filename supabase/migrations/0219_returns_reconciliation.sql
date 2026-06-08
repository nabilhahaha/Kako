-- ============================================================================
-- 0219: Enterprise Returns, Credit Notes & Promotion Reconciliation (Phase 4+)
-- ----------------------------------------------------------------------------
-- Returns preserve the COMMERCIAL REALITY of the original sale. AUGMENTS the
-- existing returns tables (erp_sales_returns / _lines, 0005) with traceability +
-- reversal columns (promotion/free-goods/discount/funding/incentive/commission),
-- adds the company return-policy config + a credit-note table. Reuses
-- erp_return_reasons (0140) + erp_trade_promotions (0195). Additive + INERT until
-- KAKO_RETURNS is on. Company-scoped RLS on new tables. Depends on 0005, 0140, 0195.
-- ============================================================================

ALTER TABLE erp_sales_returns
  ADD COLUMN IF NOT EXISTS return_type           text,   -- sales|trade|damaged|near_expiry|exception
  ADD COLUMN IF NOT EXISTS creation_mode         text,   -- from_invoice|manual|exception
  ADD COLUMN IF NOT EXISTS reason_id             uuid REFERENCES erp_return_reasons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promotion_id          uuid REFERENCES erp_trade_promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS free_qty_returned     numeric(14,3),
  ADD COLUMN IF NOT EXISTS discount_reversed     numeric(14,2),
  ADD COLUMN IF NOT EXISTS funding_reversed      numeric(14,2),
  ADD COLUMN IF NOT EXISTS incentive_adjustment  numeric(14,2),
  ADD COLUMN IF NOT EXISTS commission_adjustment numeric(14,2),
  ADD COLUMN IF NOT EXISTS credit_note_number    text,
  ADD COLUMN IF NOT EXISTS net_return_value      numeric(14,2),
  ADD COLUMN IF NOT EXISTS approval_stage        text;
CREATE INDEX IF NOT EXISTS idx_sales_returns_reason    ON erp_sales_returns (reason_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_promotion ON erp_sales_returns (promotion_id);

ALTER TABLE erp_sales_return_lines
  ADD COLUMN IF NOT EXISTS original_invoice_line_id uuid REFERENCES erp_invoice_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sold_qty          numeric(14,3),
  ADD COLUMN IF NOT EXISTS free_qty_sold     numeric(14,3),
  ADD COLUMN IF NOT EXISTS free_qty_returned numeric(14,3),
  ADD COLUMN IF NOT EXISTS discount_amount   numeric(14,2),
  ADD COLUMN IF NOT EXISTS promotion_id      uuid REFERENCES erp_trade_promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_value    numeric(14,2),
  ADD COLUMN IF NOT EXISTS net_value         numeric(14,2);
CREATE INDEX IF NOT EXISTS idx_sales_return_lines_orig_invline ON erp_sales_return_lines (original_invoice_line_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_lines_promotion    ON erp_sales_return_lines (promotion_id);

-- Company return policy (one per company; company-configurable, no hardcoding).
CREATE TABLE IF NOT EXISTS erp_return_policies (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                    uuid NOT NULL UNIQUE REFERENCES erp_companies(id) ON DELETE CASCADE,
  allow_from_invoice_only       boolean NOT NULL DEFAULT true,
  allow_manual_with_approval    boolean NOT NULL DEFAULT false,
  allow_manual_without_approval boolean NOT NULL DEFAULT false,
  block_unknown_sales           boolean NOT NULL DEFAULT true,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE erp_return_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_return_policies_tenant ON erp_return_policies;
CREATE POLICY erp_return_policies_tenant ON erp_return_policies FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Credit notes (linked to original invoice + return; with adjustments).
CREATE TABLE IF NOT EXISTS erp_credit_notes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  return_id             uuid REFERENCES erp_sales_returns(id) ON DELETE SET NULL,
  invoice_id            uuid REFERENCES erp_invoices(id) ON DELETE SET NULL,
  credit_note_number    text NOT NULL,
  amount                numeric(14,2) NOT NULL DEFAULT 0,
  promotion_adjustment  numeric(14,2) NOT NULL DEFAULT 0,
  incentive_adjustment  numeric(14,2) NOT NULL DEFAULT 0,
  commission_adjustment numeric(14,2) NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','cancelled')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, credit_note_number)
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_company ON erp_credit_notes (company_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_return  ON erp_credit_notes (return_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON erp_credit_notes (invoice_id);

ALTER TABLE erp_credit_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_credit_notes_tenant ON erp_credit_notes;
CREATE POLICY erp_credit_notes_tenant ON erp_credit_notes FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
