-- =====================================================================
-- Roshen KSA — 0005 Admin-only master-data writes + agent-level scope
--
-- - Master data (org/channels/mapping/targets/import) becomes ADMIN-only write.
-- - user_scope (visibility assignment) stays company_manager + admin.
-- - Reads unchanged (company_manager full read; area_manager area-scoped).
-- - Add user_scope.agent_id so scope can be assigned at agent level; extend
--   my_area_ids() so branch/agent scope resolves to the containing area.
-- =====================================================================

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_role() = 'admin', false);
$$;
revoke execute on function is_admin() from anon, public;
grant execute on function is_admin() to authenticated;

-- Agent-level visibility scope
alter table user_scope add column if not exists agent_id uuid references agent(id) on delete cascade;
create index if not exists user_scope_agent_idx on user_scope (agent_id);

-- Resolve all scope levels (region/area/branch/agent) to area visibility
create or replace function my_area_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select a.id
  from area a
  where exists (
    select 1 from user_scope s
    where s.user_id = auth.uid()
      and (
        s.area_id = a.id
        or s.region_id = a.region_id
        or s.branch_id in (select b.id from branch b where b.area_id = a.id)
        or s.agent_id  in (select ag.id from agent ag join branch b on b.id = ag.branch_id where b.area_id = a.id)
      )
  );
$$;

-- Master-data write policies → admin only
alter policy company_write   on company   using (is_admin()) with check (is_admin());
alter policy country_write   on country   using (is_admin()) with check (is_admin());
alter policy channel_write   on channel   using (is_admin()) with check (is_admin());
alter policy city_write      on city      using (is_admin()) with check (is_admin());
alter policy product_write   on product   using (is_admin()) with check (is_admin());
alter policy customer_write  on customer  using (is_admin()) with check (is_admin());
alter policy region_write    on region    using (is_admin()) with check (is_admin());
alter policy area_write      on area      using (is_admin()) with check (is_admin());
alter policy branch_write    on branch    using (is_admin()) with check (is_admin());
alter policy agent_write     on agent     using (is_admin()) with check (is_admin());
alter policy sales_fact_write   on sales_fact   using (is_admin()) with check (is_admin());
alter policy sla_target_write   on sla_target   using (is_admin()) with check (is_admin());
alter policy import_batch_write on import_batch using (is_admin()) with check (is_admin());
alter policy raw_row_write      on raw_import_row using (is_admin()) with check (is_admin());
alter policy import_issue_write on import_issue using (is_admin()) with check (is_admin());
alter policy mapping_profile_write on column_mapping_profile using (is_admin()) with check (is_admin());
alter policy mapping_version_write on column_mapping_version using (is_admin()) with check (is_admin());
alter policy value_mapping_write   on value_mapping using (is_admin()) with check (is_admin());

-- profile role edits → admin only
alter policy profile_admin on profile using (is_admin()) with check (is_admin());

-- user_scope (visibility assignment) → company_manager + admin (is_global)
-- (unchanged; left as is_global so company managers can assign scope)
