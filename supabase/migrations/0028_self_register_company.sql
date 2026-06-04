-- ============================================================================
-- 0028: Self-service company registration (free trial)
-- ----------------------------------------------------------------------------
-- Lets a freshly signed-up user create their own tenant company without the
-- platform owner. Runs SECURITY DEFINER to bypass the owner-only RLS on
-- companies/branches, but only ever acts for the calling user (auth.uid()) and
-- refuses if they already belong to a company. Creates the company on the free
-- plan with a trial end date, an HQ branch, and assigns the caller as admin.
-- The AFTER INSERT trigger seeds roles/permissions from the business-type
-- template. Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_self_register_company(
  p_company_name    TEXT,
  p_company_name_ar TEXT DEFAULT NULL,
  p_business_type   TEXT DEFAULT 'general',
  p_trial_days      INT  DEFAULT 14
) RETURNS UUID AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_company_id UUID;
  v_branch_id  UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً.';
  END IF;
  IF EXISTS (SELECT 1 FROM erp_user_branches WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'حسابك مرتبط بشركة بالفعل.';
  END IF;
  IF p_company_name IS NULL OR length(trim(p_company_name)) = 0 THEN
    RAISE EXCEPTION 'اسم الشركة مطلوب.';
  END IF;

  INSERT INTO erp_companies
    (name, name_ar, business_type, plan_key, currency, is_active, subscription_start, subscription_end)
  VALUES
    (trim(p_company_name), NULLIF(trim(COALESCE(p_company_name_ar, '')), ''),
     COALESCE(NULLIF(trim(p_business_type), ''), 'general'),
     'free', 'EGP', true,
     CURRENT_DATE, CURRENT_DATE + GREATEST(COALESCE(p_trial_days, 14), 1))
  RETURNING id INTO v_company_id;

  INSERT INTO erp_branches (company_id, code, name, name_ar, is_hq, is_active)
  VALUES (v_company_id, 'HQ', 'Main Branch', 'الفرع الرئيسي', true, true)
  RETURNING id INTO v_branch_id;

  INSERT INTO erp_user_branches (user_id, branch_id, role, is_default)
  VALUES (v_uid, v_branch_id, 'admin', true);

  RETURN v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION erp_self_register_company(TEXT, TEXT, TEXT, INT) TO authenticated;
