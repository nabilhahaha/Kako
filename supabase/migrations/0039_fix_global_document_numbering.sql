-- ============================================================================
-- 0039: Make document numbers globally unique across tenants
-- ----------------------------------------------------------------------------
-- erp_next_number produced "INV-<branch_code>-000001". The per-branch sequence
-- is fine, but invoice_number / journal entry_number have GLOBAL unique
-- constraints, and every company's HQ branch shares the code 'HQ' — so two
-- different companies both generate "INV-HQ-000001" and the second insert
-- fails. Fix: include a short per-company token so the number is unique across
-- tenants while staying readable: <PREFIX>-<companyToken>-<branchCode>-<000001>
-- e.g. INV-7C62-HQ-000001. Existing numbers unchanged. Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.erp_next_number(p_branch_id uuid, p_seq_type text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_prefix TEXT;
  v_branch_code TEXT;
  v_company_token TEXT;
  v_next BIGINT;
BEGIN
  SELECT b.code, upper(substr(b.company_id::text, 1, 4))
    INTO v_branch_code, v_company_token
  FROM erp_branches b WHERE b.id = p_branch_id;
  IF v_branch_code IS NULL THEN
    RAISE EXCEPTION 'Branch not found: %', p_branch_id;
  END IF;

  INSERT INTO erp_sequences (branch_id, seq_type, prefix, current_val)
  VALUES (p_branch_id, p_seq_type,
    CASE p_seq_type
      WHEN 'invoice' THEN 'INV'
      WHEN 'sales_order' THEN 'SO'
      WHEN 'purchase_order' THEN 'PO'
      WHEN 'journal' THEN 'JV'
      WHEN 'transfer' THEN 'TR'
      WHEN 'goods_receipt' THEN 'GR'
      WHEN 'return' THEN 'RET'
      WHEN 'payment_voucher' THEN 'PV'
      WHEN 'receipt_voucher' THEN 'RV'
      ELSE UPPER(LEFT(p_seq_type, 3))
    END, 1)
  ON CONFLICT (branch_id, seq_type) DO UPDATE
    SET current_val = erp_sequences.current_val + 1
  RETURNING prefix, current_val INTO v_prefix, v_next;

  RETURN v_prefix || '-' || v_company_token || '-' || v_branch_code || '-' || LPAD(v_next::TEXT, 6, '0');
END;
$function$;
