-- ============================================================================
-- Validation — Backend-Enforcement Phase F: server-action permission guards.
--
-- The guard lives in the app (`requireActionPerm` → `can()`), so this script
-- validates the AUTHORITATIVE input it resolves: the per-company grants. It
-- prints, for each Section-F action and its required capabilities, the pilot
-- roles that are ALLOWED (hold any of the caps). Any role not listed is DENIED.
-- Non-destructive; reads only. Mirrors requireActionPerm's any-of semantics.
-- ============================================================================
with act(name, caps) as (values
  ('createTransfer / cancelTransfer',        array['inventory.transfer','stock.transfer']),
  ('createStockCount / save / cancel',       array['inventory.count']),
  ('createStockRequest',                     array['stock_request.create']),
  ('rejectStockRequest',                     array['stock_request.approve']),
  ('cancelStockRequest',                     array['stock_request.create','stock_request.approve']),
  ('upsertProduct (create)',                 array['product.create']),
  ('upsertProduct (edit) / toggleActive',    array['product.edit']),
  ('createCategory',                         array['product.create']),
  ('addDrugsToProducts',                     array['product.import']),
  ('upsertCustomer (create)',                array['customer.create']),
  ('upsertCustomer (edit)',                  array['customers.manage','customer.edit']),
  ('importCustomers',                        array['customer.import']),
  ('setCustomerJourney',                     array['journey.create']),
  ('toggleCustomerActive',                   array['customers.change_status'])
),
pilot_roles as (
  select distinct ub.role from erp_user_branches ub
  join erp_branches b on b.id = ub.branch_id
  where b.company_id = '612af0bd-973c-4fed-8e76-80cf444ef9e0'
)
select a.name as action,
  string_agg(case when exists(
     select 1 from erp_company_role_permissions crp
     where crp.company_id = '612af0bd-973c-4fed-8e76-80cf444ef9e0'
       and crp.role_key = r.role and crp.permission = any(a.caps)
   ) then r.role end, ', ' order by r.role) as allowed_pilot_roles
from act a cross join pilot_roles r
group by a.name order by a.name;
