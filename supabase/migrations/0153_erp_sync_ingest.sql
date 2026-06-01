-- ============================================================================
-- 0153: ERP round-trip ingestion (PR-3) — idempotent upsert-by-external_id
-- ----------------------------------------------------------------------------
-- The scheduling framework (0094 erp_sync_jobs/runs) handles WHEN to sync; this
-- adds the WHAT: idempotent inbound upsert of customers / products / invoices
-- keyed on external_id, with a mapping+result audit (erp_sync_map) and per-batch
-- run summary (erp_sync_ingest_runs) for the Sync dashboard. Conflict policy =
-- source_wins (the external system is authoritative on inbound). Repeated syncs
-- never duplicate — they update in place.
-- ============================================================================

-- idempotency guard for invoices (no company_id column; external_id is globally unique per ERP)
create unique index if not exists uq_invoices_external on erp_invoices(external_id) where external_id is not null;

-- per-entity sync record: external↔internal + ERP source tracking (supports
-- multiple ERP systems per platform later)
create table if not exists erp_sync_map (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references erp_companies(id) on delete cascade,
  entity       text not null check (entity in ('customer','product','invoice')),
  external_id  text not null,
  internal_id  uuid,
  erp_system   text,                                  -- ERP system name (e.g. odoo, sap, dynamics)
  source       text not null default 'manual',        -- sync source/channel (rest, odoo, manual…)
  created_via_sync boolean not null default false,
  updated_via_sync boolean not null default false,
  last_result  text check (last_result in ('created','updated','skipped','error')),
  error        text,
  last_synced_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (company_id, entity, external_id)
);
create table if not exists erp_sync_ingest_runs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  entity      text not null, processed integer not null default 0, created integer not null default 0,
  updated     integer not null default 0, skipped integer not null default 0, errors integer not null default 0,
  status      text not null default 'ok', started_at timestamptz not null default now(), finished_at timestamptz, actor uuid
);
create index if not exists idx_sync_map_lookup on erp_sync_map(company_id, entity, last_synced_at desc);
create index if not exists idx_sync_ingest_runs on erp_sync_ingest_runs(company_id, entity, started_at desc);
alter table erp_sync_map enable row level security;
alter table erp_sync_ingest_runs enable row level security;
drop policy if exists erp_sync_map_read on erp_sync_map;
create policy erp_sync_map_read on erp_sync_map for select using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop policy if exists erp_sync_map_write on erp_sync_map;
create policy erp_sync_map_write on erp_sync_map for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop policy if exists erp_sync_ingest_runs_read on erp_sync_ingest_runs;
create policy erp_sync_ingest_runs_read on erp_sync_ingest_runs for select using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop policy if exists erp_sync_ingest_runs_write on erp_sync_ingest_runs;
create policy erp_sync_ingest_runs_write on erp_sync_ingest_runs for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));

-- ── Idempotent inbound ingestion (source_wins) ─────────────────────────────
create or replace function erp_sync_ingest(p_entity text, p_rows jsonb, p_source text default 'manual', p_erp_system text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); r jsonb; ext text; iid uuid; res text;
  n int := 0; c int := 0; up int := 0; er int := 0; v_run uuid;
  v_branch uuid; v_cust uuid; v_cat uuid; v_sub uuid; v_inv uuid; v_existing uuid; ln jsonb; v_prod uuid; v_status text;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_entity not in ('customer','product','invoice') then raise exception 'bad entity'; end if;
  insert into erp_sync_ingest_runs (company_id, entity, actor) values (v_company, p_entity, (select auth.uid())) returning id into v_run;

  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    n := n + 1; ext := nullif(r->>'external_id',''); res := null;
    begin
      if ext is null then raise exception 'missing external_id'; end if;

      if p_entity = 'customer' then
        select id into v_branch from erp_branches where company_id=v_company and code = nullif(r->>'branch','');
        select id into v_existing from erp_customers where company_id=v_company and external_id=ext;
        if v_existing is not null then
          update erp_customers set name=coalesce(r->>'name',name), channel=coalesce(r->>'channel',channel), classification=coalesce(r->>'classification',classification),
            branch_id=coalesce(v_branch,branch_id), updated_at=now() where id=v_existing; iid := v_existing; res := 'updated'; up := up + 1;
        else
          insert into erp_customers (company_id, code, name, channel, classification, branch_id, external_id)
            values (v_company, coalesce(nullif(r->>'code',''),ext), coalesce(r->>'name',ext), nullif(r->>'channel',''), nullif(r->>'classification',''), v_branch, ext)
            returning id into iid; res := 'created'; c := c + 1;
        end if;

      elsif p_entity = 'product' then
        v_cat := null; v_sub := null;
        if nullif(r->>'category','') is not null then
          insert into erp_product_categories(company_id, code, name) values (v_company, r->>'category', r->>'category') on conflict (company_id, code) do nothing;
          select id into v_cat from erp_product_categories where company_id=v_company and code = r->>'category';
        end if;
        if nullif(r->>'subcategory','') is not null then
          insert into erp_product_categories(company_id, code, name, parent_id) values (v_company, r->>'subcategory', r->>'subcategory', v_cat) on conflict (company_id, code) do nothing;
          select id into v_sub from erp_product_categories where company_id=v_company and code = r->>'subcategory';
        end if;
        select id into v_existing from erp_products_catalog where company_id=v_company and external_id=ext;
        if v_existing is not null then
          update erp_products_catalog set name=coalesce(r->>'name',name), brand=coalesce(nullif(r->>'brand',''),brand),
            category_id=coalesce(v_sub, v_cat, category_id), sell_price=coalesce((nullif(r->>'sell_price',''))::numeric, sell_price), updated_at=now() where id=v_existing; iid := v_existing; res := 'updated'; up := up + 1;
        else
          insert into erp_products_catalog (company_id, code, name, brand, category_id, unit, sell_price, external_id)
            values (v_company, coalesce(nullif(r->>'code',''),ext), coalesce(r->>'name',ext), nullif(r->>'brand',''), coalesce(v_sub, v_cat), coalesce(nullif(r->>'unit',''),'piece'), coalesce((nullif(r->>'sell_price',''))::numeric,0), ext)
            returning id into iid; res := 'created'; c := c + 1;
        end if;

      else  -- invoice
        select id into v_branch from erp_branches where company_id=v_company and code = nullif(r->>'branch','');
        if v_branch is null then raise exception 'unknown branch %', r->>'branch'; end if;
        select id into v_cust from erp_customers where company_id=v_company and external_id = nullif(r->>'customer','');
        if v_cust is null then raise exception 'unknown customer %', r->>'customer'; end if;
        v_status := case when (r->>'status') in ('draft','issued','paid','partially_paid','cancelled','overdue') then r->>'status' else 'issued' end;
        select id into v_existing from erp_invoices where external_id=ext;
        if v_existing is not null then
          update erp_invoices set status=v_status::erp_invoice_status, net_amount=coalesce((nullif(r->>'net_amount',''))::numeric, net_amount),
            total_amount=coalesce((nullif(r->>'total_amount',''))::numeric, total_amount), updated_at=now() where id=v_existing; iid := v_existing; res := 'updated'; up := up + 1;
          delete from erp_invoice_lines where invoice_id=v_existing;   -- source_wins: replace lines
        else
          insert into erp_invoices (branch_id, customer_id, invoice_number, status, net_amount, total_amount, external_id, created_at)
            values (v_branch, v_cust, coalesce(nullif(r->>'invoice_number',''),ext), v_status::erp_invoice_status, coalesce((nullif(r->>'net_amount',''))::numeric,0), coalesce((nullif(r->>'total_amount',''))::numeric,0), ext, coalesce((nullif(r->>'created_at',''))::timestamptz, now()))
            returning id into iid; res := 'created'; c := c + 1;
        end if;
        for ln in select * from jsonb_array_elements(coalesce(r->'lines','[]'::jsonb)) loop
          select id into v_prod from erp_products_catalog where company_id=v_company and (external_id = nullif(ln->>'product','') or code = nullif(ln->>'product',''));
          if v_prod is not null then
            insert into erp_invoice_lines (invoice_id, product_id, quantity, unit_price, line_total)
              values (iid, v_prod, coalesce((nullif(ln->>'qty',''))::numeric,0), coalesce((nullif(ln->>'unit_price',''))::numeric,0), coalesce((nullif(ln->>'line_total',''))::numeric,0));
          end if;
        end loop;
      end if;

      insert into erp_sync_map (company_id, entity, external_id, internal_id, erp_system, source, created_via_sync, updated_via_sync, last_result, last_synced_at)
        values (v_company, p_entity, ext, iid, p_erp_system, coalesce(p_source,'manual'), res='created', res='updated', res, now())
      on conflict (company_id, entity, external_id) do update set internal_id=excluded.internal_id, erp_system=coalesce(excluded.erp_system, erp_sync_map.erp_system),
        source=excluded.source, updated_via_sync = erp_sync_map.updated_via_sync or (excluded.last_result='updated'),
        last_result=excluded.last_result, error=null, last_synced_at=now();
    exception when others then
      er := er + 1;
      insert into erp_sync_map (company_id, entity, external_id, internal_id, erp_system, source, last_result, error, last_synced_at)
        values (v_company, p_entity, coalesce(ext,'?'), null, p_erp_system, coalesce(p_source,'manual'), 'error', SQLERRM, now())
      on conflict (company_id, entity, external_id) do update set last_result='error', error=SQLERRM, last_synced_at=now();
    end;
  end loop;

  update erp_sync_ingest_runs set processed=n, created=c, updated=up, errors=er, status=case when er>0 and (c+up)=0 then 'failed' when er>0 then 'partial' else 'ok' end, finished_at=now() where id=v_run;
  return jsonb_build_object('run_id', v_run, 'processed', n, 'created', c, 'updated', up, 'errors', er);
end; $$;
revoke all on function erp_sync_ingest(text, jsonb, text, text) from public, anon; grant execute on function erp_sync_ingest(text, jsonb, text, text) to authenticated;

-- ── Sync dashboard data (last sync, processed, success, error counts) ──────
create or replace function erp_sync_dashboard()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('entity', entity, 'last_sync', last_sync, 'mapped', mapped, 'errors', errors,
      'erp_systems', erp_systems, 'last_run', last_run) order by entity), '[]'::jsonb) into v from (
    select e.entity,
      (select max(last_synced_at) from erp_sync_map m where m.company_id=v_company and m.entity=e.entity) last_sync,
      (select count(*) from erp_sync_map m where m.company_id=v_company and m.entity=e.entity) mapped,
      (select count(*) from erp_sync_map m where m.company_id=v_company and m.entity=e.entity and m.last_result='error') errors,
      (select coalesce(jsonb_agg(distinct erp_system) filter (where erp_system is not null), '[]'::jsonb) from erp_sync_map m where m.company_id=v_company and m.entity=e.entity) erp_systems,
      (select jsonb_build_object('processed', processed, 'created', created, 'updated', updated, 'errors', errors, 'status', status, 'finished_at', finished_at)
        from erp_sync_ingest_runs ir where ir.company_id=v_company and ir.entity=e.entity order by started_at desc limit 1) last_run
    from (values ('customer'),('product'),('invoice')) e(entity)) z;
  return v;
end; $$;
revoke all on function erp_sync_dashboard() from public, anon; grant execute on function erp_sync_dashboard() to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_sync_dashboard, erp_sync_ingest(text,jsonb,text,text); drop tables
-- erp_sync_ingest_runs, erp_sync_map; drop uq_invoices_external.
-- ============================================================================
