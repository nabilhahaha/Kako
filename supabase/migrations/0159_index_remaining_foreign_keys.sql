-- ============================================================================
-- 0159: Cover the remaining foreign keys flagged on the FULL repo schema
-- ----------------------------------------------------------------------------
-- 0157 indexed the FKs present in the (drifted) production database. The CI
-- schema-health guard (which builds the FULL schema from all migrations) found
-- 33 more unindexed FKs — on tables introduced by migrations not yet applied to
-- production (MSL policies, journey plans, van ops, copilot, customer
-- classification/type/status, surveys, price rules, etc.). This completes FK
-- index coverage for the whole schema. Additive, idempotent; applies in-sequence
-- (the tables exist by this point). Reversible (DROP INDEX).
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_erp_attachments_deleted_by ON erp_attachments (deleted_by);
CREATE INDEX IF NOT EXISTS idx_erp_customer_attributes_company_id ON erp_customer_attributes (company_id);
CREATE INDEX IF NOT EXISTS idx_erp_customers_classification_id ON erp_customers (classification_id);
CREATE INDEX IF NOT EXISTS idx_erp_customers_customer_type_id ON erp_customers (customer_type_id);
CREATE INDEX IF NOT EXISTS idx_erp_customers_status_reason_id ON erp_customers (status_reason_id);
CREATE INDEX IF NOT EXISTS idx_erp_journey_plans_route_id ON erp_journey_plans (route_id);
CREATE INDEX IF NOT EXISTS idx_erp_msl_policies_created_by ON erp_msl_policies (created_by);
CREATE INDEX IF NOT EXISTS idx_erp_msl_policies_updated_by ON erp_msl_policies (updated_by);
CREATE INDEX IF NOT EXISTS idx_erp_msl_policy_conditions_company_id ON erp_msl_policy_conditions (company_id);
CREATE INDEX IF NOT EXISTS idx_erp_msl_policy_conditions_lookup_id ON erp_msl_policy_conditions (lookup_id);
CREATE INDEX IF NOT EXISTS idx_erp_msl_policy_items_company_id ON erp_msl_policy_items (company_id);
CREATE INDEX IF NOT EXISTS idx_erp_msl_policy_items_level_id ON erp_msl_policy_items (level_id);
CREATE INDEX IF NOT EXISTS idx_erp_outlet_grade_history_created_by ON erp_outlet_grade_history (created_by);
CREATE INDEX IF NOT EXISTS idx_erp_outlet_grade_history_customer_id ON erp_outlet_grade_history (customer_id);
CREATE INDEX IF NOT EXISTS idx_erp_outlet_grade_history_grade_id ON erp_outlet_grade_history (grade_id);
CREATE INDEX IF NOT EXISTS idx_erp_price_change_log_rule_id ON erp_price_change_log (rule_id);
CREATE INDEX IF NOT EXISTS idx_erp_price_rules_product_id ON erp_price_rules (product_id);
CREATE INDEX IF NOT EXISTS idx_erp_prices_product_id ON erp_prices (product_id);
CREATE INDEX IF NOT EXISTS idx_erp_role_limits_user_id ON erp_role_limits (user_id);
CREATE INDEX IF NOT EXISTS idx_erp_route_customers_company_id ON erp_route_customers (company_id);
CREATE INDEX IF NOT EXISTS idx_erp_routes_branch_id ON erp_routes (branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_routes_region_id ON erp_routes (region_id);
CREATE INDEX IF NOT EXISTS idx_erp_sales_returns_reason_id ON erp_sales_returns (reason_id);
CREATE INDEX IF NOT EXISTS idx_erp_survey_responses_created_by ON erp_survey_responses (created_by);
CREATE INDEX IF NOT EXISTS idx_erp_survey_responses_survey_id ON erp_survey_responses (survey_id);
CREATE INDEX IF NOT EXISTS idx_erp_survey_responses_visit_id ON erp_survey_responses (visit_id);
CREATE INDEX IF NOT EXISTS idx_erp_surveys_created_by ON erp_surveys (created_by);
CREATE INDEX IF NOT EXISTS idx_erp_surveys_updated_by ON erp_surveys (updated_by);
CREATE INDEX IF NOT EXISTS idx_erp_user_assignment_history_company_id ON erp_user_assignment_history (company_id);
CREATE INDEX IF NOT EXISTS idx_erp_van_reconciliation_lines_product_id ON erp_van_reconciliation_lines (product_id);
CREATE INDEX IF NOT EXISTS idx_erp_van_reconciliations_warehouse_id ON erp_van_reconciliations (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_erp_van_transfer_lines_product_id ON erp_van_transfer_lines (product_id);
CREATE INDEX IF NOT EXISTS idx_erp_visits_route_id ON erp_visits (route_id);
