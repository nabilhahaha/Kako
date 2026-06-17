-- 0335_supervisor_remove_txn_perms.sql
-- Supervisor Role Policy: make the supervisor an operational manager / APPROVER,
-- not a transaction executor. Removes the four transaction permissions from BOTH
-- the global supervisor definition and the pilot tenant's company override.
--
-- Removed: sales.sell, sales.collect, sales.return, sales.discount
-- Preserved (untouched): all approval / day-close / reconciliation / cash-handover
-- / customer-governance / route-planning permissions (returns.approve, day.close.*,
-- reconciliation.*, cash.handover.confirm, customer.request.approve, customers.*,
-- customer.transfer, route.create, journey.create, stock_request.approve, etc.).
--
-- Route coverage for an absent rep is handled by route REASSIGNMENT (the supervisor
-- keeps customer.transfer + route.create); a time-boxed, audited "Acting Sales Rep"
-- elevation is reserved as an exceptional procedure only.

begin;

-- 1) GLOBAL supervisor role definition.
delete from erp_role_permissions
where role_key = 'supervisor'
  and permission in ('sales.sell', 'sales.collect', 'sales.return', 'sales.discount');

-- 2) PILOT tenant company override (vantora-staging pilot company).
delete from erp_company_role_permissions
where role_key = 'supervisor'
  and company_id = '612af0bd-973c-4fed-8e76-80cf444ef9e0'
  and permission in ('sales.sell', 'sales.collect', 'sales.return', 'sales.discount');

commit;
