-- ============================================================================
-- Trade Spend Native Module — Migration 002
-- Target Supabase project: "Roshen" (ref wrkugzssuoxneftzappa)
-- Purpose: introduce the ts.* permission namespace in the Dashboard RBAC so the
--          module authorises from dash_users / dash_roles instead of hardcoded
--          email checks.
--
-- STATUS: APPLIED to the Roshen project as ts_module_002_ts_permissions
--         (final approver accounts provisioned from their existing auth.users
--         rows — dash_users.id is FK to auth.users).
--
-- Design goal: PARALLEL RUN with IDENTICAL results to the legacy app.
--   Legacy gating (exact emails) is reproduced as:
--     - broad ts.* capabilities granted per dash role, PLUS
--     - the three approval capabilities (roshen/relia/final) granted per-PERSON
--       via dash_users.overrides -> { "ts": { "grant": [...], "revoke": [...] } }
--   so that only Ahmed approves Roshen, only Muhammad approves Relia, only
--   Dmytro does Final — exactly as today.
-- ============================================================================

-- 1) Permission catalog -------------------------------------------------------
insert into public.dash_permissions (key, label, grp, sort) values
  ('ts.view',           'Trade Spend — View',            'Trade Spend', 400),
  ('ts.create',         'Trade Spend — Create activity', 'Trade Spend', 401),
  ('ts.edit',           'Trade Spend — Edit activity',   'Trade Spend', 402),
  ('ts.delete',         'Trade Spend — Delete activity', 'Trade Spend', 403),
  ('ts.approve.roshen', 'Trade Spend — Approve (Roshen)','Trade Spend', 404),
  ('ts.approve.relia',  'Trade Spend — Approve (Relia)', 'Trade Spend', 405),
  ('ts.approve.final',  'Trade Spend — Final approval',  'Trade Spend', 406),
  ('ts.export',         'Trade Spend — Export (PDF/Excel)','Trade Spend',407),
  ('ts.admin',          'Trade Spend — Module admin',    'Trade Spend', 408)
on conflict (key) do update
  set label = excluded.label, grp = excluded.grp, sort = excluded.sort;

-- 2) Role grants (broad capabilities; NOT the person-specific approvals) -------
-- append ts.* keys without disturbing existing role permissions
update public.dash_roles r
set permissions = (
  select array(select distinct unnest(r.permissions || v.add))
)
from (values
  ('super_admin',  array['ts.view','ts.create','ts.edit','ts.delete','ts.export','ts.admin']),
  ('admin',        array['ts.view','ts.create','ts.edit','ts.export']),
  ('regional_admin',array['ts.view','ts.export']),
  ('manager',      array['ts.view','ts.export']),
  ('viewer',       array['ts.view']),
  ('sales_rep',    array['ts.view','ts.create','ts.edit']),
  ('supervisor',   array['ts.view'])
) as v(role, add)
where r.role = v.role;

-- 3) Person-specific approval rights via namespaced overrides ------------------
-- Shape the module reads:  dash_users.overrides -> 'ts' -> { grant:[], revoke:[] }
-- (namespaced so it never collides with any existing Dashboard override usage)

-- Ahmed Nabil = Roshen approver (super_admin)
update public.dash_users
set overrides = jsonb_set(coalesce(overrides,'{}'::jsonb), '{ts}',
      '{"grant":["ts.approve.roshen"],"revoke":[]}'::jsonb, true)
where lower(email) = 'ahmed.nabil@roshen.trade';

-- Muhammad Zubair = Relia approver (admin)
update public.dash_users
set overrides = jsonb_set(coalesce(overrides,'{}'::jsonb), '{ts}',
      '{"grant":["ts.approve.relia"],"revoke":[]}'::jsonb, true)
where lower(email) = 'muhammad.zubair@relia-me.com';

-- Dmytro = Final approver, READ-ONLY (no create/edit), matching legacy behaviour.
-- Provisioned from the EXISTING auth accounts (dash_users.id is FK to auth.users):
insert into public.dash_users (id, email, full_name, role)
select u.id, lower(u.email),
       case lower(u.email)
         when 'dmytro.danylenko@roshen.trade' then 'Dmytro Danylenko'
         else 'Dmytro (Final Approval Test)' end,
       'viewer'
from auth.users u
where lower(u.email) in ('dmytro.danylenko@roshen.trade','dmytro.test@roshen.trade')
  and not exists (select 1 from public.dash_users d where lower(d.email) = lower(u.email));

update public.dash_users
set overrides = jsonb_set(coalesce(overrides,'{}'::jsonb), '{ts}',
      '{"grant":["ts.approve.final"],"revoke":["ts.create","ts.edit","ts.delete"]}'::jsonb, true)
where lower(email) in ('dmytro.danylenko@roshen.trade','dmytro.test@roshen.trade');

-- Rollback reference (do not run unless reverting):
--   delete from public.dash_permissions where key like 'ts.%';
--   -- and strip ts.* from dash_roles.permissions / dash_users.overrides->'ts'
