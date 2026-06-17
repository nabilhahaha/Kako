-- 0337_remove_settlement_from_branch_manager.sql
-- Settlement ownership (final): financial settlement (day.close.settle) is owned
-- ONLY by Cashier / Accountant / Admin. Remove it from BRANCH MANAGER (already
-- removed from Supervisor in 0336). Branch managers approve / review / reconcile /
-- manage operations but do not perform financial settlement (SoD).

begin;

delete from erp_company_role_permissions
where company_id = '612af0bd-973c-4fed-8e76-80cf444ef9e0'
  and role_key = 'branch_manager'
  and permission = 'day.close.settle';

delete from erp_role_permissions
where role_key = 'branch_manager'
  and permission = 'day.close.settle';

commit;
