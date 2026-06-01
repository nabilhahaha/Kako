-- ============================================================================
-- 0128: Field Execution (FE-4c) — execution scoring + rollups
-- ----------------------------------------------------------------------------
-- Simple, transparent scoring (weighting deferred to FE-5):
--   • Merchandising compliance = % of merchandising captures planogram-compliant
--   • Survey score             = average survey score
--   • OOS score                = 100 − severity-weighted out-of-stock (high 30 /
--                                 medium 15 / low 5), floored at 0
--   • Opportunity              = count + total estimated value
--   • Overall                  = simple average of the available 0–100 components
--   erp_fe_execution_scores(scope, id, from, to) → one shape for customer / route
--   / rep / visit / company rollups (the FE-5 dashboard seam).
-- erp_fe_customer_visits gains a per-visit overall score for the timeline.
-- Permission-aware. Additive.
-- ============================================================================

create or replace function erp_fe_execution_scores(p_scope text, p_id uuid default null, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare
  v_company uuid := erp_user_company_id();
  v_mt int; v_mo int; v_merch numeric; v_survey numeric;
  v_oos_count int; v_oos_w numeric; v_oos numeric;
  v_opp_count int; v_opp_value numeric; v_opp numeric; v_total int; v_overall numeric;
begin
  if v_company is null then return null; end if;
  if not (
    (select erp_is_platform_owner()) or (select erp_matrix_has('field_ops','view'))
    or (select erp_matrix_has('field_ops','dashboard')) or (select erp_matrix_has('customers','view'))
    or (select erp_is_company_admin(v_company))
  ) then raise exception 'forbidden'; end if;

  with cap as (
    select c.kind, c.score, s.values
    from erp_fe_captures c
    join erp_form_submissions s on s.id = c.submission_id
    left join erp_fe_visits v on v.id = c.visit_id
    where c.company_id = v_company
      and (p_from is null or c.created_at >= p_from)
      and (p_to   is null or c.created_at <= p_to)
      and (case coalesce(p_scope, 'company')
             when 'customer' then c.customer_id = p_id
             when 'route'    then v.route_id = p_id
             when 'rep'      then c.created_by = p_id
             when 'visit'    then c.visit_id = p_id
             else true end)
  )
  select
    count(*) filter (where kind = 'merchandising'),
    count(*) filter (where kind = 'merchandising' and values->>'planogram_compliance' = 'yes'),
    avg(score) filter (where kind = 'survey' and score is not null),
    count(*) filter (where kind = 'out_of_stock'),
    coalesce(sum(case values->>'severity' when 'high' then 30 when 'medium' then 15 when 'low' then 5 else 10 end) filter (where kind = 'out_of_stock'), 0),
    count(*) filter (where kind = 'opportunity'),
    coalesce(sum((nullif(values->>'est_value', ''))::numeric) filter (where kind = 'opportunity'), 0),
    count(*)
  into v_mt, v_mo, v_survey, v_oos_count, v_oos_w, v_opp_count, v_opp_value, v_total
  from cap;

  v_merch := case when v_mt > 0 then round(100.0 * v_mo / v_mt) else null end;
  v_oos   := case when v_oos_count > 0 then greatest(0, 100 - least(100, v_oos_w)) else null end;
  -- simple opportunity score (placeholder; weighting tuned in FE-5): presence-led
  v_opp   := case when v_opp_count > 0 then least(100, 50 + v_opp_count * 25) else null end;
  -- overall = simple average of the available 0–100 components (fully drillable)
  select round(avg(x)) into v_overall from (values (v_merch), (case when v_survey is null then null else least(100, v_survey) end), (v_oos), (v_opp)) as t(x) where x is not null;

  return jsonb_build_object(
    'scope', coalesce(p_scope, 'company'), 'captures', v_total,
    'merch_compliance', v_merch,
    'survey_score', case when v_survey is not null then round(v_survey) else null end,
    'oos_score', v_oos, 'oos_count', v_oos_count,
    'opportunity_score', v_opp, 'opportunity_count', v_opp_count, 'opportunity_value', v_opp_value,
    'overall', v_overall
  );
end; $$;
revoke all on function erp_fe_execution_scores(text, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function erp_fe_execution_scores(text, uuid, timestamptz, timestamptz) to authenticated;

-- ── Customer visit timeline + per-visit overall score ──────────────────────
create or replace function erp_fe_customer_visits(p_customer uuid, p_limit integer default 20)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare c erp_customers; v_company uuid;
begin
  select * into c from erp_customers where id = p_customer;
  if c.id is null then return '[]'::jsonb; end if;
  v_company := c.company_id;
  if not (
    (select erp_is_platform_owner())
    or (v_company = (select erp_user_company_id()) and (
      (select erp_matrix_has('customers','view')) or (select erp_matrix_has('field_ops','view')) or (select erp_is_company_admin(v_company))))
  ) then raise exception 'forbidden'; end if;

  return coalesce((
    select jsonb_agg(j order by ts desc) from (
      select v.checkin_at as ts, jsonb_build_object(
        'id', v.id, 'status', v.status, 'checkin_at', v.checkin_at, 'checkout_at', v.checkout_at,
        'geofence_status', v.geofence_status, 'distance_m', v.distance_m, 'duration_min', v.duration_min,
        'reason', v.reason, 'rep', p.full_name,
        'score', (erp_fe_execution_scores('visit', v.id, null, null)->>'overall')
      ) j
      from erp_fe_visits v left join erp_profiles p on p.id = v.rep_id
      where v.customer_id = p_customer and v.company_id = v_company
      order by v.checkin_at desc limit greatest(1, least(p_limit, 100))
    ) s
  ), '[]'::jsonb);
end; $$;
revoke all on function erp_fe_customer_visits(uuid, integer) from public, anon;
grant execute on function erp_fe_customer_visits(uuid, integer) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): restore the 0121 erp_fe_customer_visits; drop
-- erp_fe_execution_scores().
-- ============================================================================
