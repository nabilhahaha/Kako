-- Field Insights — Phase 1: security hardening (addresses linter advisors).

-- 1) Views must run as the querying user so RLS applies (not SECURITY DEFINER).
alter view v_visits_by_city          set (security_invoker = on);
alter view v_pipeline_forecast       set (security_invoker = on);
alter view v_issues_by_category      set (security_invoker = on);
alter view v_actions_due             set (security_invoker = on);
alter view v_customer_health_dist    set (security_invoker = on);
alter view v_dvap_by_area            set (security_invoker = on);
alter view v_competitor_price_latest set (security_invoker = on);

-- 2) Pin search_path on the functions that were missing it.
alter function fi_set_updated_at() set search_path = public;
alter function fi_default_framework(framework_kind, text) set search_path = public;
alter function fi_resolve_framework(framework_kind, text, uuid, date) set search_path = public;

-- 3) Reduce RPC surface. Trigger-only and recompute functions never need to be
--    called over the API; triggers run under the table owner regardless.
revoke execute on function fi_set_updated_at() from public, anon, authenticated;
revoke execute on function fi_handle_new_user() from public, anon, authenticated;
revoke execute on function fi_visit_geofence() from public, anon, authenticated;
revoke execute on function fi_log_stage_change() from public, anon, authenticated;
revoke execute on function fi_on_visit_completed() from public, anon, authenticated;
revoke execute on function fi_audit() from public, anon, authenticated;
revoke execute on function fi_audit_framework_change() from public, anon, authenticated;
revoke execute on function fi_recompute_assessment(uuid) from public, anon, authenticated;
revoke execute on function fi_recompute_customer_health(uuid) from public, anon, authenticated;
revoke execute on function fi_recompute_visit_quality(uuid) from public, anon, authenticated;

-- RBAC helpers are used inside RLS (must stay executable by authenticated) but
-- anon never needs them.
revoke execute on function fi_role() from anon;
revoke execute on function fi_is_admin() from anon;
revoke execute on function fi_my_area() from anon;
revoke execute on function fi_my_region() from anon;
revoke execute on function fi_can_access_area(uuid) from anon;
revoke execute on function fi_can_see_visit(uuid) from anon;

-- 4) Tighten UPDATE policies: WITH CHECK should mirror USING so a permitted
--    row cannot be mutated outside the user's scope (was WITH CHECK true).
drop policy customers_update on customers;
create policy customers_update on customers for update to authenticated
  using (fi_is_admin() or owner_id = auth.uid()
         or (fi_role() in ('regional_manager','area_manager','supervisor') and fi_can_access_area(area_id)))
  with check (fi_is_admin() or owner_id = auth.uid()
         or (fi_role() in ('regional_manager','area_manager','supervisor') and fi_can_access_area(area_id)));

drop policy visits_update on visits;
create policy visits_update on visits for update to authenticated
  using (fi_is_admin() or user_id = auth.uid()
         or (fi_role() in ('regional_manager','area_manager','supervisor') and fi_can_access_area(area_id)))
  with check (fi_is_admin() or user_id = auth.uid()
         or (fi_role() in ('regional_manager','area_manager','supervisor') and fi_can_access_area(area_id)));

drop policy opp_update on opportunities;
create policy opp_update on opportunities for update to authenticated
  using (fi_is_admin() or owner_id = auth.uid() or created_by = auth.uid() or fi_can_access_area(area_id))
  with check (fi_is_admin() or owner_id = auth.uid() or created_by = auth.uid() or fi_can_access_area(area_id));

drop policy issues_update on issues;
create policy issues_update on issues for update to authenticated
  using (fi_is_admin() or owner_id = auth.uid() or fi_can_access_area(area_id))
  with check (fi_is_admin() or owner_id = auth.uid() or fi_can_access_area(area_id));

drop policy fu_update on follow_ups;
create policy fu_update on follow_ups for update to authenticated
  using (fi_is_admin() or assigned_to = auth.uid() or fi_can_access_area(area_id))
  with check (fi_is_admin() or assigned_to = auth.uid() or fi_can_access_area(area_id));

drop policy ap_update on action_plans;
create policy ap_update on action_plans for update to authenticated
  using (fi_is_admin() or responsible_id = auth.uid() or (visit_id is not null and fi_can_see_visit(visit_id)))
  with check (fi_is_admin() or responsible_id = auth.uid() or (visit_id is not null and fi_can_see_visit(visit_id)));

drop policy visit_photos_upd on visit_photos;
create policy visit_photos_upd on visit_photos for update to authenticated
  using (visit_id is null or fi_can_see_visit(visit_id))
  with check (visit_id is null or fi_can_see_visit(visit_id));

drop policy competitor_observations_upd on competitor_observations;
create policy competitor_observations_upd on competitor_observations for update to authenticated
  using (visit_id is null or fi_can_see_visit(visit_id))
  with check (visit_id is null or fi_can_see_visit(visit_id));

drop policy competitor_price_points_upd on competitor_price_points;
create policy competitor_price_points_upd on competitor_price_points for update to authenticated
  using (visit_id is null or fi_can_see_visit(visit_id))
  with check (visit_id is null or fi_can_see_visit(visit_id));

drop policy voice_notes_upd on voice_notes;
create policy voice_notes_upd on voice_notes for update to authenticated
  using (visit_id is null or fi_can_see_visit(visit_id))
  with check (visit_id is null or fi_can_see_visit(visit_id));
