-- ============================================================================
-- 0149: Configuration Governance (CG-1) — change envelope + feature flags
-- ----------------------------------------------------------------------------
-- A governed change-management spine: every company-level config change is a
-- versioned record that moves through draft→review→approved→published→
-- rolled_back, targets an audience (all / role / region / branch / route / team
-- / user), can be previewed by pilot/test users, and carries a full audit trail
-- (created/modified/approved/published_by + published/rollback dates).
--
-- SAFE PUBLISHING is structural: live resolution reads only the PUBLISHED state
-- (erp_cfg_feature_flags); drafts never touch it. Pilot users preview drafts via
-- erp_cfg_flag_preview ("view as"). Feature flags (modules + features per
-- company) are the first concrete config type wired end-to-end; the envelope's
-- payload/config_type are generic so roles, promotions, commission plans, etc.
-- plug in later. Conflict validation runs before publish.
-- ============================================================================

create table if not exists erp_cfg_changes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  lineage_id  uuid, version integer not null default 1, supersedes uuid references erp_cfg_changes(id) on delete set null, is_latest boolean not null default true,
  config_type text not null,                          -- feature_flag|module|role|permission|promotion|commission_plan|setting|weights|threshold|dashboard|workflow…
  config_ref  text not null,                          -- the target key/id
  title       text not null,
  payload     jsonb not null default '{}'::jsonb,     -- proposed config (e.g. {"enabled":true,"kind":"module"})
  audience    jsonb not null default '{"kind":"all"}'::jsonb,  -- {kind, ids:[]}
  pilot_users uuid[] not null default '{}',           -- test/demo users who can preview the draft
  state       text not null default 'draft' check (state in ('draft','review','approved','published','rolled_back')),
  conflicts   jsonb not null default '[]'::jsonb,
  created_by  uuid, modified_by uuid, approved_by uuid, published_by uuid,
  published_at timestamptz, rolled_back_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_cfg_changes_lookup on erp_cfg_changes(company_id, config_type, config_ref, state);
-- live PUBLISHED feature/module flags (the only thing live resolution reads)
create table if not exists erp_cfg_feature_flags (
  company_id  uuid not null references erp_companies(id) on delete cascade,
  key         text not null,
  kind        text not null default 'feature' check (kind in ('feature','module')),
  enabled     boolean not null default true,
  audience    jsonb not null default '{"kind":"all"}'::jsonb,
  source_change uuid, published_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (company_id, key)
);
alter table erp_cfg_changes enable row level security;
alter table erp_cfg_feature_flags enable row level security;
-- governance is admin-facing
drop policy if exists erp_cfg_changes_rw on erp_cfg_changes;
create policy erp_cfg_changes_rw on erp_cfg_changes for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop policy if exists erp_cfg_flags_read on erp_cfg_feature_flags;
create policy erp_cfg_flags_read on erp_cfg_feature_flags for select using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_cfg_flags_write on erp_cfg_feature_flags;
create policy erp_cfg_flags_write on erp_cfg_feature_flags for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop trigger if exists trg_audit_erp_cfg_changes on erp_cfg_changes;
create trigger trg_audit_erp_cfg_changes after insert or update or delete on erp_cfg_changes for each row execute function erp_audit_capture();
drop trigger if exists erp_cfg_changes_updated on erp_cfg_changes;
create trigger erp_cfg_changes_updated before update on erp_cfg_changes for each row execute function erp_set_updated_at();

-- ── Does a user fall within an audience rule? ──────────────────────────────
create or replace function erp_cfg_audience_matches(p_audience jsonb, p_user uuid, p_company uuid)
returns boolean language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_kind text := coalesce(p_audience->>'kind','all'); v_ids text[] := array(select jsonb_array_elements_text(coalesce(p_audience->'ids','[]'::jsonb)));
begin
  if v_kind = 'all' then return true; end if;
  if p_user is null then return false; end if;
  if v_kind = 'user' then return p_user::text = any(v_ids); end if;
  if v_kind = 'role' then return exists(select 1 from erp_user_branches ub join erp_branches b on b.id=ub.branch_id where ub.user_id=p_user and b.company_id=p_company and ub.role = any(v_ids)); end if;
  if v_kind = 'region' then return exists(select 1 from erp_user_branches ub join erp_branches b on b.id=ub.branch_id where ub.user_id=p_user and b.company_id=p_company and b.region = any(v_ids)); end if;
  if v_kind = 'branch' then return exists(select 1 from erp_user_branches ub where ub.user_id=p_user and ub.branch_id::text = any(v_ids)); end if;
  if v_kind = 'route' then return exists(select 1 from erp_routes r where r.id::text = any(v_ids) and r.rep_id=p_user); end if;
  if v_kind = 'team' then
    return exists(with recursive up as (
        select p_user uid, 0 d union all
        select ub.reports_to, up.d+1 from erp_user_branches ub join up on ub.user_id=up.uid where ub.reports_to is not null and up.d < 12)
      select 1 from up where uid::text = any(v_ids));
  end if;
  return false;
end; $$;
revoke all on function erp_cfg_audience_matches(jsonb, uuid, uuid) from public, anon; grant execute on function erp_cfg_audience_matches(jsonb, uuid, uuid) to authenticated;

-- ── Authoring + workflow (company admin / owner) ───────────────────────────
create or replace function erp_cfg_change_save(p_config_type text, p_config_ref text, p_title text, p_payload jsonb,
  p_audience jsonb default '{"kind":"all"}'::jsonb, p_pilot uuid[] default '{}', p_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_id uuid := p_id; v_uid uuid := (select auth.uid());
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_id is null then
    insert into erp_cfg_changes (company_id, config_type, config_ref, title, payload, audience, pilot_users, created_by, modified_by)
      values (v_company, p_config_type, p_config_ref, p_title, coalesce(p_payload,'{}'::jsonb), coalesce(p_audience,'{"kind":"all"}'::jsonb), coalesce(p_pilot,'{}'), v_uid, v_uid) returning id into v_id;
    update erp_cfg_changes set lineage_id = v_id where id = v_id;
  else
    update erp_cfg_changes set title=p_title, payload=coalesce(p_payload,payload), audience=coalesce(p_audience,audience), pilot_users=coalesce(p_pilot,pilot_users), modified_by=v_uid, updated_at=now()
      where id=p_id and company_id=v_company and state='draft';   -- only drafts are editable
  end if;
  return jsonb_build_object('id', v_id);
end; $$;
revoke all on function erp_cfg_change_save(text,text,text,jsonb,jsonb,uuid[],uuid) from public, anon; grant execute on function erp_cfg_change_save(text,text,text,jsonb,jsonb,uuid[],uuid) to authenticated;

create or replace function erp_cfg_new_version(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); o erp_cfg_changes; v_id uuid;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  select * into o from erp_cfg_changes where id=p_id and company_id=v_company; if not found then raise exception 'not found'; end if;
  insert into erp_cfg_changes (company_id, lineage_id, version, supersedes, is_latest, config_type, config_ref, title, payload, audience, pilot_users, state, created_by, modified_by)
    values (v_company, coalesce(o.lineage_id,o.id), o.version+1, o.id, false, o.config_type, o.config_ref, o.title, o.payload, o.audience, o.pilot_users, 'draft', (select auth.uid()), (select auth.uid())) returning id into v_id;
  return jsonb_build_object('id', v_id, 'version', o.version+1);
end; $$;
revoke all on function erp_cfg_new_version(uuid) from public, anon; grant execute on function erp_cfg_new_version(uuid) to authenticated;

-- draft→review→approved (publish/rollback are separate)
create or replace function erp_cfg_set_state(p_id uuid, p_state text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); o erp_cfg_changes; v_uid uuid := (select auth.uid());
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_state not in ('draft','review','approved') then raise exception 'use publish/rollback'; end if;
  select * into o from erp_cfg_changes where id=p_id and company_id=v_company; if not found then raise exception 'not found'; end if;
  if p_state='review' and o.state<>'draft' then raise exception 'must be draft'; end if;
  if p_state='approved' and o.state<>'review' then raise exception 'must be in review'; end if;
  update erp_cfg_changes set state=p_state, approved_by = case when p_state='approved' then v_uid else approved_by end, updated_at=now() where id=p_id;
  return jsonb_build_object('ok', true, 'state', p_state);
end; $$;
revoke all on function erp_cfg_set_state(uuid, text) from public, anon; grant execute on function erp_cfg_set_state(uuid, text) to authenticated;

-- ── Conflict validation (before publish) ───────────────────────────────────
create or replace function erp_cfg_validate_change(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); o erp_cfg_changes; issues jsonb := '[]'::jsonb;
begin
  if v_company is null then raise exception 'forbidden'; end if;
  select * into o from erp_cfg_changes where id=p_id and company_id=v_company; if not found then raise exception 'not found'; end if;
  -- a competing in-flight change for the same target
  if exists(select 1 from erp_cfg_changes c where c.company_id=v_company and c.config_type=o.config_type and c.config_ref=o.config_ref and c.id<>o.id and c.state in ('draft','review','approved')) then
    issues := issues || jsonb_build_object('level','error','code','concurrent_change','message','Another in-flight change targets the same config'); end if;
  -- a published config of the same target with an overlapping audience (audience overlap)
  if o.config_type in ('feature_flag','module') and exists(
      select 1 from erp_cfg_feature_flags f where f.company_id=v_company and f.key=o.config_ref and f.source_change <> o.id
        and ((f.audience->>'kind')='all' or (o.audience->>'kind')='all'
          or (f.audience->>'kind')=(o.audience->>'kind') and (select array(select jsonb_array_elements_text(f.audience->'ids')) && array(select jsonb_array_elements_text(o.audience->'ids'))))) then
    issues := issues || jsonb_build_object('level','warning','code','audience_overlap','message','Overlaps an existing published flag audience'); end if;
  return issues;
end; $$;
revoke all on function erp_cfg_validate_change(uuid) from public, anon; grant execute on function erp_cfg_validate_change(uuid) to authenticated;

-- ── Publish (approved → published; applies feature flags; refuses on conflict) ─
create or replace function erp_cfg_publish(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); o erp_cfg_changes; v_issues jsonb;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  select * into o from erp_cfg_changes where id=p_id and company_id=v_company; if not found then raise exception 'not found'; end if;
  if o.state <> 'approved' then raise exception 'must be approved'; end if;
  v_issues := erp_cfg_validate_change(p_id);
  if exists(select 1 from jsonb_array_elements(v_issues) e where e->>'level'='error') then
    return jsonb_build_object('ok', false, 'issues', v_issues); end if;
  if o.config_type in ('feature_flag','module') then
    insert into erp_cfg_feature_flags (company_id, key, kind, enabled, audience, source_change, published_at)
      values (v_company, o.config_ref, case when o.config_type='module' then 'module' else coalesce(o.payload->>'kind','feature') end,
        coalesce((o.payload->>'enabled')::boolean, true), o.audience, o.id, now())
    on conflict (company_id, key) do update set kind=excluded.kind, enabled=excluded.enabled, audience=excluded.audience, source_change=excluded.source_change, published_at=now(), updated_at=now();
  end if;
  update erp_cfg_changes set state='published', published_by=(select auth.uid()), published_at=now(), conflicts=v_issues, updated_at=now() where id=p_id;
  update erp_cfg_changes set is_latest=false where company_id=v_company and coalesce(lineage_id,id)=coalesce(o.lineage_id,o.id) and id<>p_id;
  update erp_cfg_changes set is_latest=true where id=p_id;
  return jsonb_build_object('ok', true, 'issues', v_issues);
end; $$;
revoke all on function erp_cfg_publish(uuid) from public, anon; grant execute on function erp_cfg_publish(uuid) to authenticated;

-- ── Rollback (published → rolled_back; reverts to the prior published version) ─
create or replace function erp_cfg_rollback(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); o erp_cfg_changes; prev erp_cfg_changes;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  select * into o from erp_cfg_changes where id=p_id and company_id=v_company; if not found then raise exception 'not found'; end if;
  if o.state <> 'published' then raise exception 'must be published'; end if;
  -- the previous published change for the same target
  select * into prev from erp_cfg_changes where company_id=v_company and config_type=o.config_type and config_ref=o.config_ref and id<>o.id and state='published' order by published_at desc limit 1;
  if o.config_type in ('feature_flag','module') then
    if prev.id is not null then
      insert into erp_cfg_feature_flags (company_id, key, kind, enabled, audience, source_change, published_at)
        values (v_company, prev.config_ref, case when prev.config_type='module' then 'module' else coalesce(prev.payload->>'kind','feature') end,
          coalesce((prev.payload->>'enabled')::boolean, true), prev.audience, prev.id, now())
      on conflict (company_id, key) do update set kind=excluded.kind, enabled=excluded.enabled, audience=excluded.audience, source_change=excluded.source_change, published_at=now(), updated_at=now();
    else
      delete from erp_cfg_feature_flags where company_id=v_company and key=o.config_ref;   -- nothing prior → remove
    end if;
  end if;
  update erp_cfg_changes set state='rolled_back', rolled_back_at=now(), is_latest=false, updated_at=now() where id=p_id;
  if prev.id is not null then update erp_cfg_changes set is_latest=true where id=prev.id; end if;
  return jsonb_build_object('ok', true, 'reverted_to', prev.id);
end; $$;
revoke all on function erp_cfg_rollback(uuid) from public, anon; grant execute on function erp_cfg_rollback(uuid) to authenticated;

-- ── Live flag resolution (PUBLISHED only) + pilot preview ("view as") ──────
create or replace function erp_cfg_flag(p_key text)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_uid uuid := (select auth.uid()); f erp_cfg_feature_flags;
begin
  if v_company is null then return jsonb_build_object('enabled', null, 'source', 'default'); end if;
  select * into f from erp_cfg_feature_flags where company_id=v_company and key=p_key;
  if found and erp_cfg_audience_matches(f.audience, v_uid, v_company) then return jsonb_build_object('enabled', f.enabled, 'source', 'published'); end if;
  return jsonb_build_object('enabled', null, 'source', 'default');
end; $$;
revoke all on function erp_cfg_flag(text) from public, anon; grant execute on function erp_cfg_flag(text) to authenticated;

-- view-as: what would p_as_user experience, INCLUDING drafts they pilot?
create or replace function erp_cfg_flag_preview(p_key text, p_as_user uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_uid uuid := (select auth.uid()); f erp_cfg_feature_flags; dc erp_cfg_changes; v_base jsonb;
begin
  if v_company is null then return null; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company)) or v_uid = p_as_user) then raise exception 'forbidden'; end if;
  -- published baseline for the target user
  select * into f from erp_cfg_feature_flags where company_id=v_company and key=p_key;
  v_base := case when f.company_id is not null and erp_cfg_audience_matches(f.audience, p_as_user, v_company)
    then jsonb_build_object('enabled', f.enabled, 'source', 'published') else jsonb_build_object('enabled', null, 'source', 'default') end;
  -- a draft/review/approved change the user pilots overrides the preview (never affects live)
  select * into dc from erp_cfg_changes where company_id=v_company and config_type in ('feature_flag','module') and config_ref=p_key
    and state in ('draft','review','approved') and p_as_user = any(pilot_users) order by version desc limit 1;
  if dc.id is not null then return jsonb_build_object('enabled', coalesce((dc.payload->>'enabled')::boolean, true), 'source', 'pilot_draft', 'state', dc.state); end if;
  return v_base;
end; $$;
revoke all on function erp_cfg_flag_preview(text, uuid) from public, anon; grant execute on function erp_cfg_flag_preview(text, uuid) to authenticated;

-- ── Listings for the console ───────────────────────────────────────────────
create or replace function erp_cfg_changes_list(p_state text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'config_type', config_type, 'config_ref', config_ref, 'title', title, 'payload', payload,
    'audience', audience, 'pilot_users', to_jsonb(pilot_users), 'state', state, 'version', version, 'conflicts', conflicts,
    'created_by', created_by, 'approved_by', approved_by, 'published_by', published_by, 'published_at', published_at, 'rolled_back_at', rolled_back_at, 'created_at', created_at)
    order by updated_at desc), '[]'::jsonb) into v from erp_cfg_changes where company_id=v_company and (p_state is null or state=p_state);
  return v;
end; $$;
revoke all on function erp_cfg_changes_list(text) from public, anon; grant execute on function erp_cfg_changes_list(text) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_cfg_changes_list / _flag_preview / _flag /
-- _rollback / _publish / _validate_change / _set_state / _new_version /
-- _change_save / _audience_matches; drop tables erp_cfg_feature_flags, erp_cfg_changes.
-- ============================================================================
