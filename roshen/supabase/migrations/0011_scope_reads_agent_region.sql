-- =====================================================================
-- Roshen KSA — 0011 Scope-aware reads for the Region → City → Distributor model
--
-- area_id-based read policies miss city-based distributors (area_id NULL).
-- Add my_agent_ids() (distributors visible to the user via region/city/area/
-- branch/agent scope) and extend sales_fact / sla_target / import_batch reads
-- so Area Managers see SLA and imports for their assigned scope.
--
-- Non-destructive: new function + alter policy (read only). Writes unchanged
-- (admin / is_global).
-- =====================================================================

create or replace function my_agent_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select ag.id from agent ag
  where exists (
    select 1 from user_scope s
    where s.user_id = auth.uid()
      and (
        s.agent_id = ag.id
        or (ag.city_id is not null and (
              s.city_id = ag.city_id
              or s.region_id = (select c.region_id from city c where c.id = ag.city_id)
           ))
        or (ag.branch_id is not null and (
              s.branch_id = ag.branch_id
              or s.area_id = (select b.area_id from branch b where b.id = ag.branch_id)
              or s.region_id = (select a.region_id from area a join branch b on b.area_id = a.id where b.id = ag.branch_id)
           ))
      )
  );
$$;
revoke execute on function my_agent_ids() from anon, public;
grant execute on function my_agent_ids() to authenticated;

alter policy sales_fact_read on sales_fact
  using (is_global() or agent_id in (select my_agent_ids()) or region_id in (select my_region_ids()));

alter policy sla_target_read on sla_target
  using (
    is_global()
    or area_id in (select my_area_ids())
    or (level = 'region' and region_id in (select my_region_ids()))
    or (level = 'agent'  and agent_id  in (select my_agent_ids()))
  );

alter policy import_batch_read on import_batch
  using (is_global() or agent_id in (select my_agent_ids()));
