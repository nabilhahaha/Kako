-- Field Insights — Phase 1: Row Level Security on every table.
-- Scope = role (fi_role) + geography (fi_can_access_area). Reference/config
-- tables are readable by any authenticated user and writable by admins.

create or replace function fi_can_see_visit(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from visits v
    where v.id = p and (fi_is_admin() or v.user_id = auth.uid() or fi_can_access_area(v.area_id))
  )
$$;

-- ---- Reference / config: read-all, admin-write ------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'regions','areas','companies','competitors',
    'frameworks','framework_dimensions','framework_bands','framework_stages','framework_rules'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy %I on %I for select to authenticated using (true);', t||'_read', t);
    execute format('create policy %I on %I for insert to authenticated with check (fi_is_admin());', t||'_ins', t);
    execute format('create policy %I on %I for update to authenticated using (fi_is_admin()) with check (fi_is_admin());', t||'_upd', t);
    execute format('create policy %I on %I for delete to authenticated using (fi_is_admin());', t||'_del', t);
  end loop;
end $$;

-- ---- Audit logs: admin read only --------------------------------------
alter table framework_audit_log enable row level security;
create policy framework_audit_read on framework_audit_log for select to authenticated using (fi_is_admin());
alter table audit_logs enable row level security;
create policy audit_logs_read on audit_logs for select to authenticated using (fi_is_admin());

-- ---- Profiles ---------------------------------------------------------
alter table profiles enable row level security;
create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or fi_is_admin() or fi_can_access_area(area_id));
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid() or fi_is_admin()) with check (id = auth.uid() or fi_is_admin());
create policy profiles_admin_write on profiles for all to authenticated
  using (fi_is_admin()) with check (fi_is_admin());

-- ---- Customers / locations -------------------------------------------
alter table customers enable row level security;
create policy customers_read on customers for select to authenticated
  using (fi_is_admin() or fi_can_access_area(area_id) or owner_id = auth.uid());
create policy customers_insert on customers for insert to authenticated
  with check (fi_role() <> 'viewer');
create policy customers_update on customers for update to authenticated
  using (fi_is_admin() or owner_id = auth.uid()
         or (fi_role() in ('regional_manager','area_manager','supervisor') and fi_can_access_area(area_id)))
  with check (true);
create policy customers_delete on customers for delete to authenticated using (fi_is_admin());

alter table locations enable row level security;
create policy locations_read on locations for select to authenticated
  using (exists(select 1 from customers c where c.id = customer_id
               and (fi_is_admin() or fi_can_access_area(c.area_id) or c.owner_id = auth.uid())));
create policy locations_write on locations for all to authenticated
  using (exists(select 1 from customers c where c.id = customer_id
               and (fi_is_admin() or fi_can_access_area(c.area_id) or c.owner_id = auth.uid())))
  with check (fi_role() <> 'viewer');

-- ---- Customer history / health snapshots ------------------------------
alter table customer_dev_stage_history enable row level security;
create policy cdsh_read on customer_dev_stage_history for select to authenticated
  using (exists(select 1 from customers c where c.id = customer_id
               and (fi_is_admin() or fi_can_access_area(c.area_id) or c.owner_id = auth.uid())));
alter table customer_health_snapshots enable row level security;
create policy chs_read on customer_health_snapshots for select to authenticated
  using (exists(select 1 from customers c where c.id = customer_id
               and (fi_is_admin() or fi_can_access_area(c.area_id) or c.owner_id = auth.uid())));

-- ---- Visits -----------------------------------------------------------
alter table visits enable row level security;
create policy visits_read on visits for select to authenticated
  using (fi_is_admin() or user_id = auth.uid() or fi_can_access_area(area_id));
create policy visits_insert on visits for insert to authenticated
  with check (user_id = auth.uid() and fi_role() <> 'viewer');
create policy visits_update on visits for update to authenticated
  using (fi_is_admin() or user_id = auth.uid()
         or (fi_role() in ('regional_manager','area_manager','supervisor') and fi_can_access_area(area_id)))
  with check (true);
create policy visits_delete on visits for delete to authenticated using (fi_is_admin());

-- ---- Visit children (photos, competitor obs, prices, voice) -----------
do $$
declare t text;
begin
  foreach t in array array['visit_photos','competitor_observations','competitor_price_points','voice_notes'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy %I on %I for select to authenticated using (visit_id is null or fi_can_see_visit(visit_id));', t||'_read', t);
    execute format('create policy %I on %I for insert to authenticated with check (fi_role() <> ''viewer'' and (visit_id is null or fi_can_see_visit(visit_id)));', t||'_ins', t);
    execute format('create policy %I on %I for update to authenticated using (visit_id is null or fi_can_see_visit(visit_id)) with check (true);', t||'_upd', t);
    execute format('create policy %I on %I for delete to authenticated using (fi_is_admin() or (visit_id is not null and fi_can_see_visit(visit_id)));', t||'_del', t);
  end loop;
end $$;

-- ---- Assessments + scores --------------------------------------------
alter table assessments enable row level security;
create policy assessments_read on assessments for select to authenticated
  using (fi_is_admin() or (visit_id is not null and fi_can_see_visit(visit_id)) or fi_can_access_area(area_id));
create policy assessments_write on assessments for all to authenticated
  using (fi_is_admin() or (visit_id is not null and fi_can_see_visit(visit_id)) or fi_can_access_area(area_id))
  with check (fi_role() <> 'viewer');

alter table assessment_scores enable row level security;
create policy assessment_scores_read on assessment_scores for select to authenticated
  using (exists(select 1 from assessments a where a.id = assessment_id
               and (fi_is_admin() or (a.visit_id is not null and fi_can_see_visit(a.visit_id)) or fi_can_access_area(a.area_id))));
create policy assessment_scores_write on assessment_scores for all to authenticated
  using (exists(select 1 from assessments a where a.id = assessment_id
               and (fi_is_admin() or (a.visit_id is not null and fi_can_see_visit(a.visit_id)) or fi_can_access_area(a.area_id))))
  with check (fi_role() <> 'viewer');

-- ---- Opportunities / issues / follow-ups ------------------------------
alter table opportunities enable row level security;
create policy opp_read on opportunities for select to authenticated
  using (fi_is_admin() or fi_can_access_area(area_id) or owner_id = auth.uid() or created_by = auth.uid());
create policy opp_insert on opportunities for insert to authenticated with check (fi_role() <> 'viewer');
create policy opp_update on opportunities for update to authenticated
  using (fi_is_admin() or owner_id = auth.uid() or created_by = auth.uid() or fi_can_access_area(area_id)) with check (true);
create policy opp_delete on opportunities for delete to authenticated using (fi_is_admin());

alter table issues enable row level security;
create policy issues_read on issues for select to authenticated
  using (fi_is_admin() or fi_can_access_area(area_id) or owner_id = auth.uid());
create policy issues_insert on issues for insert to authenticated with check (fi_role() <> 'viewer');
create policy issues_update on issues for update to authenticated
  using (fi_is_admin() or owner_id = auth.uid() or fi_can_access_area(area_id)) with check (true);
create policy issues_delete on issues for delete to authenticated using (fi_is_admin());

alter table follow_ups enable row level security;
create policy fu_read on follow_ups for select to authenticated
  using (fi_is_admin() or fi_can_access_area(area_id) or assigned_to = auth.uid()
         or (visit_id is not null and fi_can_see_visit(visit_id)));
create policy fu_insert on follow_ups for insert to authenticated with check (fi_role() <> 'viewer');
create policy fu_update on follow_ups for update to authenticated
  using (fi_is_admin() or assigned_to = auth.uid() or fi_can_access_area(area_id)) with check (true);
create policy fu_delete on follow_ups for delete to authenticated using (fi_is_admin());

-- ---- Action plans -----------------------------------------------------
alter table action_plans enable row level security;
create policy ap_read on action_plans for select to authenticated
  using (fi_is_admin() or responsible_id = auth.uid() or (visit_id is not null and fi_can_see_visit(visit_id)));
create policy ap_insert on action_plans for insert to authenticated
  with check (fi_role() <> 'viewer' and (visit_id is null or fi_can_see_visit(visit_id)));
create policy ap_update on action_plans for update to authenticated
  using (fi_is_admin() or responsible_id = auth.uid() or (visit_id is not null and fi_can_see_visit(visit_id))) with check (true);
create policy ap_delete on action_plans for delete to authenticated using (fi_is_admin());
