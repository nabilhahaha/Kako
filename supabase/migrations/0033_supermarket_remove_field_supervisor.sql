-- ============================================================================
-- 0033: Supermarket template — remove the field "supervisor" role
-- ----------------------------------------------------------------------------
-- Reviewed real retail-store staffing (supermarket / pharmacy / clothing /
-- cafe / restaurant): the final sale always happens at the CASHIER, and retail
-- stores have no field "sales supervisor" (that role belongs to distribution /
-- delivery, where reps sell in the field). The supermarket template still had
-- 'supervisor'; remove it so retail templates are consistent: branch manager +
-- cashier (the point of sale) + warehouse_keeper + accountant + staff + viewer.
--
-- Only affects the TEMPLATE for newly created supermarket companies; existing
-- companies' role config is untouched. There are currently no supermarket
-- tenants. Idempotent.
-- ============================================================================

DELETE FROM erp_business_type_roles
WHERE business_type = 'supermarket' AND role_key = 'supervisor';
