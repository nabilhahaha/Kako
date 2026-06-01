-- ============================================================================
-- 0129: Field Execution (FE-4d) — grouped execution scores (route / rep lists)
-- ----------------------------------------------------------------------------
-- erp_fe_execution_scores_by(group, from, to) → an array of per-route or per-rep
-- execution scores WITH the full component breakdown, for the manager dashboard
-- and the FE-5 dashboards. Same simple scoring as erp_fe_execution_scores.
-- Permission-aware (field_ops:view/dashboard or admin). Additive.
-- ============================================================================

create or replace function erp_fe_execution_scores_by(p_group text, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_grp text := coalesce(p_group, 'route'); v jsonb;
begin
  if v_company is null then return '[]'::jsonb; end if;
  if not (
    (select erp_is_platform_owner()) or (select erp_matrix_has('field_ops','view'))
    or (select erp_matrix_has('field_ops','dashboard')) or (select erp_is_company_admin(v_company))
  ) then raise exception 'forbidden'; end if;
  if v_grp not in ('route','rep') then v_grp := 'route'; end if;

  with base as (
    select
      case v_grp when 'route' then v.route_id else c.created_by end as gid,
      case v_grp when 'route' then coalesce(rt.name, '—') else coalesce(pr.full_name, '—') end as gname,
      count(*) filter (where c.kind = 'merchandising') as mt,
      count(*) filter (where c.kind = 'merchandising' and s.values->>'planogram_compliance' = 'yes') as mo,
      count(*) filter (where c.kind = 'survey' and c.score is not null) as scnt,
      avg(c.score) filter (where c.kind = 'survey' and c.score is not null) as savg,
      count(*) filter (where c.kind = 'out_of_stock') as ocnt,
      coalesce(sum(case s.values->>'severity' when 'high' then 30 when 'medium' then 15 when 'low' then 5 else 10 end) filter (where c.kind = 'out_of_stock'), 0) as ow,
      count(*) filter (where c.kind = 'opportunity') as pcnt,
      coalesce(sum((nullif(s.values->>'est_value', ''))::numeric) filter (where c.kind = 'opportunity'), 0) as pval,
      count(*) as total
    from erp_fe_captures c
    join erp_form_submissions s on s.id = c.submission_id
    left join erp_fe_visits v on v.id = c.visit_id
    left join erp_routes rt on rt.id = v.route_id
    left join erp_profiles pr on pr.id = c.created_by
    where c.company_id = v_company
      and (p_from is null or c.created_at >= p_from) and (p_to is null or c.created_at <= p_to)
    group by 1, 2
  ),
  comp as (
    select gid, gname, total, ocnt as oos_count, pcnt as opp_count, pval,
      case when mt > 0 then round(100.0 * mo / mt) else null end as merch,
      case when scnt > 0 then round(savg) else null end as survey,
      case when ocnt > 0 then greatest(0, 100 - least(100, ow)) else null end as oos,
      case when pcnt > 0 then least(100, 50 + pcnt * 25) else null end as opp
    from base
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gid, 'name', gname, 'captures', total,
    'merch_compliance', merch, 'survey_score', survey, 'oos_score', oos, 'oos_count', oos_count,
    'opportunity_score', opp, 'opportunity_count', opp_count, 'opportunity_value', pval,
    'overall', (select round(avg(x)) from (values (merch), (case when survey is null then null else least(100, survey) end), (oos), (opp)) as t(x) where x is not null)
  ) order by (select round(avg(x)) from (values (merch), (case when survey is null then null else least(100, survey) end), (oos), (opp)) as t(x) where x is not null) desc nulls last), '[]'::jsonb)
  into v from comp where gid is not null;
  return v;
end; $$;
revoke all on function erp_fe_execution_scores_by(text, timestamptz, timestamptz) from public, anon;
grant execute on function erp_fe_execution_scores_by(text, timestamptz, timestamptz) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_fe_execution_scores_by().
-- ============================================================================
