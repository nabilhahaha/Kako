-- ============================================================================
-- 0127: Field Execution (FE-4b) — per-type, permission-driven capture access
-- ----------------------------------------------------------------------------
-- Each capture TYPE is its own Permission-Matrix entitlement, so companies decide
-- who performs each activity, by permission not role title. A general umbrella
-- (field_ops:execute) still grants all capture types for simple setups.
--   resources: fe_merchandising / fe_competitor / fe_survey / fe_oos /
--              fe_opportunity / fe_quick  (action: execute)
--   • erp_fe_can_capture(kind) — admin OR umbrella OR the type's own permission.
--   • erp_fe_capture_kinds()    — the set of kinds the current user may execute
--     (drives the launcher so users see only their capture types).
-- Enforced in the captures RLS + the submit action + the launcher. Additive.
-- ============================================================================

-- Per-type capture permissions in the matrix catalog.
insert into erp_permission_catalog (key, resource, action, module, name_ar, name_en) values
  ('fe_merchandising:execute','fe_merchandising','execute','field_ops','التقاط — العرض والتشغيل','Capture — Merchandising'),
  ('fe_competitor:execute',   'fe_competitor',   'execute','field_ops','التقاط — المنافسون','Capture — Competitor'),
  ('fe_survey:execute',       'fe_survey',       'execute','field_ops','التقاط — الاستبيانات','Capture — Surveys'),
  ('fe_oos:execute',          'fe_oos',          'execute','field_ops','التقاط — نفاد المخزون','Capture — Out-of-stock'),
  ('fe_opportunity:execute',  'fe_opportunity',  'execute','field_ops','التقاط — الفرص','Capture — Opportunities'),
  ('fe_quick:execute',        'fe_quick',        'execute','field_ops','التقاط — سريع','Capture — Quick')
on conflict (key) do nothing;
-- Defaults: company admins manage; field roles keep the umbrella (field_ops:execute
-- from 0119) which grants all types. Companies grant per-type to narrow access.
insert into erp_matrix_role_permissions (company_id, role_key, permission)
  select null, 'admin', key from erp_permission_catalog where resource like 'fe_%' and action='execute'
on conflict do nothing;

-- kind → matrix resource
create or replace function erp_fe_capture_resource(p_kind text)
returns text language sql immutable as $$
  select case p_kind
    when 'merchandising' then 'fe_merchandising'
    when 'competitor'    then 'fe_competitor'
    when 'survey'        then 'fe_survey'
    when 'out_of_stock'  then 'fe_oos'
    when 'opportunity'   then 'fe_opportunity'
    else 'fe_quick' end;
$$;

-- Can the current user execute this capture kind? (umbrella OR the type's perm;
-- erp_matrix_has already returns true for company admins / platform owner.)
create or replace function erp_fe_can_capture(p_kind text)
returns boolean language sql stable security definer
set search_path to 'public','pg_temp' as $$
  select (select erp_matrix_has('field_ops','execute'))
      or (select erp_matrix_has(erp_fe_capture_resource(p_kind), 'execute'));
$$;
revoke all on function erp_fe_can_capture(text) from public, anon;
grant execute on function erp_fe_can_capture(text) to authenticated;

-- The kinds the current user may execute (drives the launcher).
create or replace function erp_fe_capture_kinds()
returns text[] language sql stable security definer
set search_path to 'public','pg_temp' as $$
  select coalesce(array(
    select k from unnest(array['merchandising','competitor','survey','out_of_stock','opportunity','quick']) k
     where erp_fe_can_capture(k)
  ), array[]::text[]);
$$;
revoke all on function erp_fe_capture_kinds() from public, anon;
grant execute on function erp_fe_capture_kinds() to authenticated;

-- Captures write requires the per-type capture permission.
drop policy if exists erp_fe_captures_write on erp_fe_captures;
create policy erp_fe_captures_write on erp_fe_captures for all using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and (
    (created_by = (select auth.uid()) and erp_fe_can_capture(kind)) or (select erp_is_company_admin(company_id))))
) with check (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and (
    (created_by = (select auth.uid()) and erp_fe_can_capture(kind)) or (select erp_is_company_admin(company_id))))
);

-- ============================================================================
-- ROLLBACK (manual): restore the 0126 erp_fe_captures_write policy; drop
-- erp_fe_capture_kinds / erp_fe_can_capture / erp_fe_capture_resource; delete the
-- fe_*:execute catalog rows.
-- ============================================================================
