-- Trade Spend Native Module — 006: DATA FIX (APPLIED during production validation)
-- The real Final Approver (dmytro.danylenko) had lost his ts.approve.final grant
-- — dash_users.overrides.ts was null (cleared by a later user-management op after
-- migration 002 set it), so he could not perform Final Approval in production.
-- Restore it to match the design (and dmytro.test).
-- Root-cause hardening recommendation: move final-approver grants to a dedicated
-- dash_role, or make the User-Management UI preserve the overrides.ts namespace.
update public.dash_users
set overrides = jsonb_set(coalesce(overrides,'{}'::jsonb), '{ts}',
      '{"grant":["ts.approve.final"],"revoke":["ts.create","ts.edit","ts.delete"]}'::jsonb, true)
where lower(email) = 'dmytro.danylenko@roshen.trade';
