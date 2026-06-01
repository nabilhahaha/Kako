-- ============================================================================
-- 0139: Field Execution (FE-5e-4) — inbox support: note history, owner filter,
--       aging in list, single-alert getter
-- ----------------------------------------------------------------------------
-- Additive support for the alerts inbox UI. Adds an append-only resolution-note
-- HISTORY (notes jsonb), surfaces aging (seen_count / first_seen / last_seen) +
-- owner_level in the scoped list, adds an owner filter, and a single-alert
-- getter (scope-checked) for the detail/quick-action surface.
-- ============================================================================

alter table erp_fe_alerts add column if not exists notes jsonb not null default '[]'::jsonb;  -- [{at,by,by_name,status,note}]

-- ── set_status: append a note to the history when one is provided ───────────
create or replace function erp_fe_alert_set_status(p_alert uuid, p_status text, p_note text default null, p_due date default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_uid uuid := (select auth.uid());
begin
  if v_company is null then raise exception 'forbidden'; end if;
  if p_status not in ('open','acknowledged','in_progress','resolved','dismissed') then raise exception 'bad status'; end if;
  if not erp_fe_alert_in_scope(p_alert) then raise exception 'forbidden'; end if;
  update erp_fe_alerts set status = p_status,
    resolution_note = coalesce(p_note, resolution_note),
    notes = case when p_note is null or p_note = '' then notes
      else notes || jsonb_build_object('at', now(), 'by', v_uid, 'by_name', (select full_name from erp_profiles where id = v_uid), 'status', p_status, 'note', p_note) end,
    due_date = coalesce(p_due, due_date),
    resolved_at = case when p_status in ('resolved','dismissed') then now() else null end,
    resolved_by = case when p_status in ('resolved','dismissed') then v_uid else null end,
    updated_at = now()
    where id = p_alert and company_id = v_company;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function erp_fe_alert_set_status(uuid, text, text, date) from public, anon; grant execute on function erp_fe_alert_set_status(uuid, text, text, date) to authenticated;

-- ── Scoped list: + owner filter, + aging (seen_count/first_seen/last_seen) ─
drop function if exists erp_fe_alerts_list(text[], text, text, integer);
create function erp_fe_alerts_list(p_status text[] default null, p_category text default null, p_severity text default null, p_owner uuid default null, p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  if v_company is null then return '[]'::jsonb; end if;
  if not (v_all or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard'))) then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(j order by sev_rank, created_at desc), '[]'::jsonb) into v from (
    select a.created_at, (case a.severity when 'critical' then 0 when 'warning' then 1 else 2 end) sev_rank,
      jsonb_build_object('id', a.id, 'category', a.category, 'rule_key', a.rule_key, 'severity', a.severity, 'scope_level', a.scope_level,
        'title', a.title, 'details', a.details, 'metric', a.metric, 'status', a.status, 'due_date', a.due_date,
        'overdue', (a.due_date is not null and a.due_date < current_date and a.status not in ('resolved','dismissed')),
        'owner_id', a.owner_id, 'owner', op.full_name, 'owner_level', a.owner_level, 'resolution_note', a.resolution_note,
        'notes_count', jsonb_array_length(a.notes), 'resolved_at', a.resolved_at,
        'seen_count', a.seen_count, 'first_seen_at', a.first_seen_at, 'last_seen_at', a.last_seen_at,
        'region', a.region, 'area', a.area, 'route_id', a.route_id, 'rep_id', a.rep_id, 'rep', rp.full_name,
        'customer_id', a.customer_id, 'customer', cu.name, 'sku', a.sku, 'created_at', a.created_at,
        'href', case when a.customer_id is not null then '/field/customers/'||a.customer_id when a.route_id is not null then '/field/perf/route/'||a.route_id
          when a.rep_id is not null then '/field/perf/rep/'||a.rep_id else null end) j
    from erp_fe_alerts a
    left join erp_profiles op on op.id = a.owner_id
    left join erp_profiles rp on rp.id = a.rep_id
    left join erp_customers cu on cu.id = a.customer_id
    where a.company_id = v_company
      and (v_all or a.owner_id = (select auth.uid()) or a.rep_id = any(v_team))
      and (p_status is null or a.status = any(p_status))
      and (p_category is null or a.category = p_category)
      and (p_severity is null or a.severity = p_severity)
      and (p_owner is null or a.owner_id = p_owner)
    order by sev_rank, a.created_at desc limit greatest(1, least(coalesce(p_limit,200), 500))) s;
  return v;
end; $$;
revoke all on function erp_fe_alerts_list(text[], text, text, uuid, integer) from public, anon; grant execute on function erp_fe_alerts_list(text[], text, text, uuid, integer) to authenticated;

-- ── Single alert (scope-checked) with full note history + aging ────────────
create or replace function erp_fe_alert_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v jsonb;
begin
  if not erp_fe_alert_in_scope(p_id) then return null; end if;
  select jsonb_build_object('id', a.id, 'category', a.category, 'rule_key', a.rule_key, 'severity', a.severity, 'scope_level', a.scope_level,
    'title', a.title, 'details', a.details, 'metric', a.metric, 'status', a.status, 'due_date', a.due_date,
    'overdue', (a.due_date is not null and a.due_date < current_date and a.status not in ('resolved','dismissed')),
    'owner_id', a.owner_id, 'owner', op.full_name, 'owner_level', a.owner_level, 'resolution_note', a.resolution_note,
    'notes', a.notes, 'resolved_at', a.resolved_at, 'seen_count', a.seen_count, 'first_seen_at', a.first_seen_at, 'last_seen_at', a.last_seen_at,
    'region', a.region, 'area', a.area, 'route_id', a.route_id, 'rep_id', a.rep_id, 'rep', rp.full_name,
    'customer_id', a.customer_id, 'customer', cu.name, 'sku', a.sku, 'created_at', a.created_at) into v
  from erp_fe_alerts a left join erp_profiles op on op.id = a.owner_id left join erp_profiles rp on rp.id = a.rep_id left join erp_customers cu on cu.id = a.customer_id
  where a.id = p_id;
  return v;
end; $$;
revoke all on function erp_fe_alert_get(uuid) from public, anon; grant execute on function erp_fe_alert_get(uuid) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): restore the 0136 set_status / 4-arg erp_fe_alerts_list;
-- drop erp_fe_alert_get; drop the notes column.
-- ============================================================================
