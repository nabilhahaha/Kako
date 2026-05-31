-- ============================================================================
-- 0065: Make the free/trial plan a 1-user taste (faster self-signup)
-- ----------------------------------------------------------------------------
-- Self-registration provisions a company on the 'free' plan. Lower it to a
-- single user so a newcomer can sign up and try their vertical immediately,
-- then upgrade for more users/branches. Modules still follow the business type.
-- ============================================================================

UPDATE erp_plans
   SET max_users = 1,
       max_branches = 1,
       name_ar = 'تجريبي'
 WHERE key = 'free';
