-- Field Insights — Phase 1: config-driven scoring engine, audit, views.

-- Weighted assessment scoring (e.g. DVAP). Reads weights/bands from the
-- pinned framework version so historical results stay reproducible.
create or replace function fi_recompute_assessment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_fw uuid; v_overall numeric; v_band text;
begin
  select framework_id into v_fw from assessments where id = p_id;
  if v_fw is null then return; end if;
  select case when sum(d.weight) > 0
              then round(sum(s.score * d.weight) / sum(d.weight), 2) else null end
    into v_overall
  from assessment_scores s
  join framework_dimensions d on d.framework_id = v_fw and d.key = s.dimension_key
  where s.assessment_id = p_id and s.score is not null;
  select key into v_band from framework_bands
   where framework_id = v_fw and v_overall is not null
     and v_overall >= min_score and v_overall <= max_score
   order by min_score desc limit 1;
  update assessments set overall_score = v_overall, band_key = v_band, updated_at = now()
   where id = p_id;
end;
$$;

-- Configurable Visit Quality Score.
create or replace function fi_recompute_visit_quality(p_visit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v visits%rowtype; v_fw uuid; rec record; sig numeric;
        total_w numeric := 0; acc numeric := 0; bd jsonb := '{}'::jsonb;
        n_photos int; has_dvap boolean; has_comp boolean; has_exec boolean;
begin
  select * into v from visits where id = p_visit;
  if not found then return; end if;
  v_fw := coalesce(v.quality_framework_id,
            fi_resolve_framework('visit_quality','fmcg',
              (select company_id from customers where id = v.customer_id)));
  if v_fw is null then return; end if;

  select count(*) into n_photos from visit_photos where visit_id = p_visit;
  select exists(select 1 from assessments a join frameworks f on f.id = a.framework_id
                where a.visit_id = p_visit and f.kind = 'assessment') into has_dvap;
  select (exists(select 1 from competitor_observations where visit_id = p_visit)
       or exists(select 1 from competitor_price_points where visit_id = p_visit)) into has_comp;
  select (exists(select 1 from opportunities where visit_id = p_visit)
       or exists(select 1 from issues where visit_id = p_visit)
       or exists(select 1 from action_plans where visit_id = p_visit)
       or exists(select 1 from follow_ups where visit_id = p_visit)) into has_exec;

  for rec in select key, weight from framework_dimensions where framework_id = v_fw loop
    sig := case rec.key
      when 'objective'       then case when coalesce(length(trim(v.objective)),0) > 0 then 100 else 0 end
      when 'summary_outcome' then case when v.summary is not null and v.outcome is not null then 100 else 0 end
      when 'gps'             then case when v.gps_in_range then 100 else 0 end
      when 'photos'          then case when n_photos >= 2 then 100 when n_photos = 1 then 50 else 0 end
      when 'dvap'            then case when has_dvap then 100 else 0 end
      when 'competitor'      then case when has_comp then 100 else 0 end
      when 'execution'       then case when has_exec then 100 else 0 end
      else 0 end;
    acc := acc + sig * rec.weight; total_w := total_w + rec.weight;
    bd := bd || jsonb_build_object(rec.key, sig);
  end loop;

  if total_w > 0 then
    update visits set quality_framework_id = v_fw,
                      quality_score = round(acc / total_w, 2),
                      quality_breakdown = bd, updated_at = now()
     where id = p_visit;
  end if;
end;
$$;

-- Configurable Customer Health composite.
create or replace function fi_recompute_customer_health(p_customer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c customers%rowtype; v_fw uuid; rec record; sig numeric;
        total_w numeric := 0; acc numeric := 0; drivers jsonb := '{}'::jsonb;
        v_band text; last_visit timestamptz; days_since numeric; target_days numeric := 30;
        sev_sum numeric; avg_gap numeric; v_overall_dvap numeric;
begin
  select * into c from customers where id = p_customer;
  if not found then return; end if;
  v_fw := coalesce(c.health_framework_id,
            fi_resolve_framework('health','fmcg', c.company_id));
  if v_fw is null then return; end if;

  select overall_score into v_overall_dvap
  from assessments a join frameworks f on f.id = a.framework_id
  where a.customer_id = p_customer and f.kind = 'assessment'
  order by a.created_at desc limit 1;

  select max(coalesce(started_at, created_at)) into last_visit
  from visits where customer_id = p_customer and deleted_at is null;
  days_since := case when last_visit is null then 999
                     else extract(epoch from (now() - last_visit)) / 86400 end;

  select coalesce(sum(case severity when 'critical' then 4 when 'high' then 3
                                    when 'medium' then 2 else 1 end), 0) into sev_sum
  from issues where customer_id = p_customer and status in ('open','in_progress') and deleted_at is null;

  select avg(abs(price_gap_pct)) into avg_gap
  from competitor_price_points where customer_id = p_customer and price_gap_pct is not null;

  for rec in select key, weight from framework_dimensions where framework_id = v_fw loop
    sig := case rec.key
      when 'dvap'        then coalesce(v_overall_dvap, 50)
      when 'recency'     then greatest(0, least(100, 100 - greatest(0, days_since - target_days) * 2))
      when 'issues'      then greatest(0, 100 - sev_sum * 10)
      when 'opportunity' then case
                              when exists(select 1 from opportunities where customer_id = p_customer
                                          and status = 'closed_won' and updated_at > now() - interval '90 days') then 100
                              when exists(select 1 from opportunities where customer_id = p_customer
                                          and status in ('open','in_progress') and deleted_at is null) then 60
                              else 30 end
      when 'pricing'     then case when avg_gap is null then 50
                                   else greatest(0, 100 - avg_gap * 2) end
      else 50 end;
    acc := acc + sig * rec.weight; total_w := total_w + rec.weight;
    drivers := drivers || jsonb_build_object(rec.key, round(sig, 1));
  end loop;

  if total_w > 0 then
    acc := round(acc / total_w, 2);
    select key into v_band from framework_bands
     where framework_id = v_fw and acc >= min_score and acc <= max_score
     order by min_score desc limit 1;
    update customers set health_framework_id = v_fw, health_score = acc,
                         health_band_key = v_band, health_updated_at = now()
     where id = p_customer;
    insert into customer_health_snapshots(customer_id, framework_id, health_score, health_band_key, drivers)
    values (p_customer, v_fw, acc, v_band, drivers);
  end if;
end;
$$;

-- Recompute visit quality + customer health when a visit is completed.
create or replace function fi_on_visit_completed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform fi_recompute_visit_quality(new.id);
  if new.customer_id is not null then
    perform fi_recompute_customer_health(new.customer_id);
  end if;
  return new;
end;
$$;
create trigger trg_visit_completed after update of status on visits
  for each row when (new.status = 'completed') execute function fi_on_visit_completed();

-- ---- General audit log -------------------------------------------------
create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  diff jsonb,
  created_at timestamptz not null default now()
);
create index on audit_logs (entity_type, entity_id);

create or replace function fi_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare nj jsonb; oj jsonb; eid uuid;
begin
  if tg_op <> 'INSERT' then oj := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then nj := to_jsonb(new); end if;
  eid := (coalesce(nj, oj)->>'id')::uuid;
  insert into audit_logs(actor_id, entity_type, entity_id, action, diff)
  values (auth.uid(), tg_table_name, eid, lower(tg_op),
          jsonb_build_object('old', oj, 'new', nj));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger trg_audit_visits after insert or update or delete on visits
  for each row execute function fi_audit();
create trigger trg_audit_opportunities after insert or update or delete on opportunities
  for each row execute function fi_audit();
create trigger trg_audit_issues after insert or update or delete on issues
  for each row execute function fi_audit();

-- ---- Reporting views ---------------------------------------------------
create view v_visits_by_city as
  select coalesce(l.city, a.city) as city, count(*) as visits
  from visits vi
  left join locations l on l.id = vi.location_id
  left join areas a on a.id = vi.area_id
  where vi.deleted_at is null group by 1;

create view v_pipeline_forecast as
  select area_id, status, count(*) n,
         coalesce(sum(estimated_value),0) gross_value,
         coalesce(sum(forecast_value),0)  weighted_value
  from opportunities where deleted_at is null group by area_id, status;

create view v_issues_by_category as
  select issue_type, status, count(*) n
  from issues where deleted_at is null group by issue_type, status;

create view v_actions_due as
  select * from action_plans
  where status <> 'completed' and target_date <= current_date + 7;

create view v_customer_health_dist as
  select health_band_key, count(*) n
  from customers where deleted_at is null and health_band_key is not null
  group by health_band_key;

create view v_dvap_by_area as
  select a.area_id,
         avg(s.score) filter (where s.dimension_key = 'distribution') dist,
         avg(s.score) filter (where s.dimension_key = 'visibility')   vis,
         avg(s.score) filter (where s.dimension_key = 'availability') avail,
         avg(s.score) filter (where s.dimension_key = 'pricing')      price,
         avg(s.score) filter (where s.dimension_key = 'promotion')    promo,
         avg(a.overall_score) overall
  from assessments a
  join frameworks f on f.id = a.framework_id and f.kind = 'assessment'
  join assessment_scores s on s.assessment_id = a.id
  group by a.area_id;

create view v_competitor_price_latest as
  select distinct on (product, competitor_id)
         product, competitor_id, shelf_price, promo_price, price_gap_pct, captured_at
  from competitor_price_points
  order by product, competitor_id, captured_at desc;
