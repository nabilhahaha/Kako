-- ============================================================================
-- 0150: Configuration Governance (CG-2) — console support
-- ----------------------------------------------------------------------------
-- Per-transition audit timestamps, a single-change getter with resolved actor
-- names + audience labels (for the audit timeline + pilot visibility), a publish
-- IMPACT preview (affected users / roles / branches / routes / regions / modules)
-- and a ROLLBACK preview (what will be reverted).
-- ============================================================================

alter table erp_cfg_changes add column if not exists reviewed_by uuid;
alter table erp_cfg_changes add column if not exists reviewed_at timestamptz;
alter table erp_cfg_changes add column if not exists approved_at timestamptz;

-- stamp review/approve timestamps
create or replace function erp_cfg_set_state(p_id uuid, p_state text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); o erp_cfg_changes; v_uid uuid := (select auth.uid());
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_state not in ('draft','review','approved') then raise exception 'use publish/rollback'; end if;
  select * into o from erp_cfg_changes where id=p_id and company_id=v_company; if not found then raise exception 'not found'; end if;
  if p_state='review' and o.state<>'draft' then raise exception 'must be draft'; end if;
  if p_state='approved' and o.state<>'review' then raise exception 'must be in review'; end if;
  update erp_cfg_changes set state=p_state,
    reviewed_by = case when p_state='review' then v_uid else reviewed_by end, reviewed_at = case when p_state='review' then now() else reviewed_at end,
    approved_by = case when p_state='approved' then v_uid else approved_by end, approved_at = case when p_state='approved' then now() else approved_at end,
    updated_at=now() where id=p_id;
  return jsonb_build_object('ok', true, 'state', p_state);
end; $$;
revoke all on function erp_cfg_set_state(uuid, text) from public, anon; grant execute on function erp_cfg_set_state(uuid, text) to authenticated;

-- label for an audience id (entity name or literal)
create or replace function erp_cfg_id_label(p_kind text, p_id text)
returns text language sql stable security definer set search_path to 'public','pg_temp' as $$
  select case p_kind
    when 'user' then (select full_name from erp_profiles where id = nullif(p_id,'')::uuid)
    when 'team' then (select full_name from erp_profiles where id = nullif(p_id,'')::uuid)
    when 'branch' then (select name from erp_branches where id = nullif(p_id,'')::uuid)
    when 'route' then (select name from erp_routes where id = nullif(p_id,'')::uuid)
    else p_id end;
$$;
revoke all on function erp_cfg_id_label(text, text) from public, anon; grant execute on function erp_cfg_id_label(text, text) to authenticated;

-- detail + resolved names (audit timeline) + audience/pilot labels
create or replace function erp_cfg_change_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); o erp_cfg_changes; v jsonb;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then return null; end if;
  select * into o from erp_cfg_changes where id=p_id and company_id=v_company; if not found then return null; end if;
  select jsonb_build_object('id', o.id, 'config_type', o.config_type, 'config_ref', o.config_ref, 'title', o.title, 'payload', o.payload,
    'state', o.state, 'version', o.version, 'conflicts', o.conflicts,
    'audience', jsonb_build_object('kind', o.audience->>'kind',
      'labels', coalesce((select jsonb_agg(erp_cfg_id_label(o.audience->>'kind', x)) from jsonb_array_elements_text(coalesce(o.audience->'ids','[]'::jsonb)) x), '[]'::jsonb)),
    'pilot_users', coalesce((select jsonb_agg(jsonb_build_object('id', pu, 'name', (select full_name from erp_profiles where id=pu))) from unnest(o.pilot_users) pu), '[]'::jsonb),
    'timeline', jsonb_build_array(
      jsonb_build_object('event','created','by',(select full_name from erp_profiles where id=o.created_by),'at',o.created_at),
      jsonb_build_object('event','modified','by',(select full_name from erp_profiles where id=o.modified_by),'at',o.updated_at),
      jsonb_build_object('event','reviewed','by',(select full_name from erp_profiles where id=o.reviewed_by),'at',o.reviewed_at),
      jsonb_build_object('event','approved','by',(select full_name from erp_profiles where id=o.approved_by),'at',o.approved_at),
      jsonb_build_object('event','published','by',(select full_name from erp_profiles where id=o.published_by),'at',o.published_at),
      jsonb_build_object('event','rolled_back','by',null,'at',o.rolled_back_at))) into v;
  return v;
end; $$;
revoke all on function erp_cfg_change_get(uuid) from public, anon; grant execute on function erp_cfg_change_get(uuid) to authenticated;

-- ── Publish impact: who/what this change reaches ───────────────────────────
create or replace function erp_cfg_impact(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); o erp_cfg_changes; v jsonb;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then return null; end if;
  select * into o from erp_cfg_changes where id=p_id and company_id=v_company; if not found then return null; end if;
  with cusers as (select distinct ub.user_id uid from erp_user_branches ub join erp_branches b on b.id=ub.branch_id where b.company_id=v_company),
  aff as (select uid from cusers where erp_cfg_audience_matches(o.audience, uid, v_company)),
  mem as (select distinct ab.user_id, ab.role, br.id branch_id, br.name branch_name, br.region
    from erp_user_branches ab join erp_branches br on br.id=ab.branch_id where ab.user_id in (select uid from aff) and br.company_id=v_company)
  select jsonb_build_object(
    'affected_users', (select count(*) from aff),
    'sample_users', coalesce((select jsonb_agg(full_name) from (select full_name from erp_profiles where id in (select uid from aff) order by full_name limit 10) z), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(distinct role) from mem), '[]'::jsonb),
    'branches', coalesce((select jsonb_agg(distinct branch_name) from mem), '[]'::jsonb),
    'regions', coalesce((select jsonb_agg(distinct region) from mem where region is not null), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(r.name) from erp_routes r where r.company_id=v_company and r.rep_id in (select uid from aff)), '[]'::jsonb),
    'modules', case when o.config_type='module' then jsonb_build_array(o.config_ref) else '[]'::jsonb end) into v;
  return v;
end; $$;
revoke all on function erp_cfg_impact(uuid) from public, anon; grant execute on function erp_cfg_impact(uuid) to authenticated;

-- ── Rollback preview: current published vs what it reverts to ──────────────
create or replace function erp_cfg_rollback_preview(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); o erp_cfg_changes; prev erp_cfg_changes;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then return null; end if;
  select * into o from erp_cfg_changes where id=p_id and company_id=v_company; if not found then return null; end if;
  select * into prev from erp_cfg_changes where company_id=v_company and config_type=o.config_type and config_ref=o.config_ref and id<>o.id and state='published' order by published_at desc limit 1;
  return jsonb_build_object('config_ref', o.config_ref, 'current', o.payload,
    'reverts_to', case when prev.id is not null then jsonb_build_object('id', prev.id, 'version', prev.version, 'payload', prev.payload) else null end,
    'removes', prev.id is null);
end; $$;
revoke all on function erp_cfg_rollback_preview(uuid) from public, anon; grant execute on function erp_cfg_rollback_preview(uuid) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): restore 0149 set_state; drop erp_cfg_rollback_preview,
-- _impact, _change_get, _id_label; drop reviewed_by/at, approved_at.
-- ============================================================================
