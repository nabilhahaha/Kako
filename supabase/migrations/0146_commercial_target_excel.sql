-- ============================================================================
-- 0146: Commercial Performance Pack (CX-1) — Target Excel upgrade
-- ----------------------------------------------------------------------------
-- Makes bulk multi-dimension target import usable from Excel/CSV: rows may carry
-- a human-friendly `dim_ref` (customer code / rep email / route or branch /
-- category code / SKU / brand / channel …) which the importer resolves to the
-- internal dim_id (company-scoped). Validation now reports unknown references.
-- The existing dim_id path still works; this is purely additive.
-- ============================================================================

-- ── Resolve a human-friendly reference to a target dim_id (company-scoped) ──
create or replace function erp_cp_resolve_dim(p_dim_type text, p_ref text)
returns text language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v text;
begin
  if v_company is null or p_ref is null or p_ref = '' then return null; end if;
  v := case p_dim_type
    when 'rep' then coalesce(
        (select u.id::text from auth.users u join erp_user_branches ub on ub.user_id=u.id join erp_branches b on b.id=ub.branch_id where b.company_id=v_company and lower(u.email)=lower(p_ref) limit 1),
        (select pr.id::text from erp_profiles pr join erp_user_branches ub on ub.user_id=pr.id join erp_branches b on b.id=ub.branch_id where b.company_id=v_company and pr.full_name=p_ref limit 1))
    when 'customer' then (select id::text from erp_customers where company_id=v_company and code=p_ref limit 1)
    when 'route' then (select id::text from erp_routes where company_id=v_company and name=p_ref limit 1)
    when 'branch' then (select id::text from erp_branches where company_id=v_company and code=p_ref limit 1)
    when 'category' then (select id::text from erp_product_categories where code=p_ref or name=p_ref limit 1)
    when 'subcategory' then (select id::text from erp_product_categories where code=p_ref or name=p_ref limit 1)
    when 'sku' then (select code from erp_products_catalog where code=p_ref limit 1)
    when 'company' then null
    else p_ref end;   -- brand / channel / classification / region / area are literals
  return v;
end; $$;
revoke all on function erp_cp_resolve_dim(text, text) from public, anon; grant execute on function erp_cp_resolve_dim(text, text) to authenticated;

-- ── Validate a batch (now resolves dim_ref → dim_id; reports unknown_ref) ───
create or replace function erp_cp_targets_validate(p_rows jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); issues jsonb := '[]'::jsonb; r jsonb; idx int := 0;
  v_dim text; v_id text; v_ref text; v_metric text; v_period date; v_amount numeric; seen text[] := '{}'; k text;
  geo text[] := array['company','region','area','branch','route','customer','rep']; prod text[] := array['category','subcategory','brand','sku'];
begin
  if v_company is null then raise exception 'forbidden'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    idx := idx + 1; v_dim := r->>'dim_type'; v_id := nullif(r->>'dim_id',''); v_ref := nullif(r->>'dim_ref',''); v_metric := r->>'metric';
    begin v_period := date_trunc('month', (r->>'period')::date)::date; exception when others then v_period := null; end;
    begin v_amount := (r->>'amount')::numeric; exception when others then v_amount := null; end;
    if v_dim is null or v_dim not in ('company','region','area','branch','route','rep','channel','classification','customer','category','subcategory','brand','sku') then
      issues := issues || jsonb_build_object('row', idx, 'level','error','code','bad_dim','message','Unknown dimension'); continue; end if;
    -- resolve a friendly reference when no explicit id was given
    if v_id is null and v_ref is not null and v_dim <> 'company' then
      v_id := erp_cp_resolve_dim(v_dim, v_ref);
      if v_id is null then issues := issues || jsonb_build_object('row', idx,'level','error','code','unknown_ref','message','Could not resolve "'||v_ref||'" for '||v_dim); continue; end if;
    end if;
    if v_metric not in ('value','quantity') then issues := issues || jsonb_build_object('row', idx,'level','error','code','bad_metric','message','Metric must be value or quantity'); continue; end if;
    if v_period is null then issues := issues || jsonb_build_object('row', idx,'level','error','code','bad_period','message','Invalid period'); continue; end if;
    if v_amount is null or v_amount < 0 then issues := issues || jsonb_build_object('row', idx,'level','error','code','bad_amount','message','Amount must be ≥ 0'); continue; end if;
    if not erp_cp_target_in_scope(v_dim, v_id) then issues := issues || jsonb_build_object('row', idx,'level','error','code','out_of_scope','message','Outside your scope'); continue; end if;
    k := v_period::text||'|'||v_dim||'|'||coalesce(v_id,'')||'|'||v_metric;
    if k = any(seen) then issues := issues || jsonb_build_object('row', idx,'level','error','code','dup_in_batch','message','Duplicate row in this import'); continue; end if;
    seen := seen || k;
    if exists(select 1 from erp_cp_targets t where t.company_id=v_company and t.period_month=v_period and t.dim_type=v_dim and coalesce(t.dim_id,'')=coalesce(v_id,'') and t.metric=v_metric and t.status<>'archived') then
      issues := issues || jsonb_build_object('row', idx,'level','error','code','duplicate','message','A target already exists for this dimension/month'); continue; end if;
    if (v_dim = any(geo) and exists(select 1 from erp_cp_targets t where t.company_id=v_company and t.period_month=v_period and t.metric=v_metric and t.status<>'archived' and t.dim_type = any(geo) and t.dim_type <> v_dim))
    or (v_dim = any(prod) and exists(select 1 from erp_cp_targets t where t.company_id=v_company and t.period_month=v_period and t.metric=v_metric and t.status<>'archived' and t.dim_type = any(prod) and t.dim_type <> v_dim)) then
      issues := issues || jsonb_build_object('row', idx,'level','warning','code','overlap','message','Overlaps targets at another level of the same chain'); end if;
  end loop;
  return issues;
end; $$;
revoke all on function erp_cp_targets_validate(jsonb) from public, anon; grant execute on function erp_cp_targets_validate(jsonb) to authenticated;

-- ── Import a batch (resolves dim_ref; validate-then-commit) ────────────────
create or replace function erp_cp_targets_import(p_rows jsonb, p_status text default 'draft')
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_issues jsonb; r jsonb; n int := 0; v_id text;
begin
  if v_company is null then raise exception 'forbidden'; end if;
  v_issues := erp_cp_targets_validate(p_rows);
  if exists(select 1 from jsonb_array_elements(v_issues) e where e->>'level' = 'error') then
    return jsonb_build_object('ok', false, 'imported', 0, 'issues', v_issues); end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    v_id := nullif(r->>'dim_id','');
    if v_id is null and nullif(r->>'dim_ref','') is not null and (r->>'dim_type') <> 'company' then v_id := erp_cp_resolve_dim(r->>'dim_type', r->>'dim_ref'); end if;
    perform erp_cp_target_save((r->>'period')::date, r->>'dim_type', v_id, r->>'metric', (r->>'amount')::numeric, coalesce(p_status,'draft'), nullif(r->>'notes',''));
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'imported', n, 'issues', v_issues);
end; $$;
revoke all on function erp_cp_targets_import(jsonb, text) from public, anon; grant execute on function erp_cp_targets_import(jsonb, text) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): restore 0142/0146 prior bodies of erp_cp_targets_validate
-- and _import; drop erp_cp_resolve_dim.
-- ============================================================================
