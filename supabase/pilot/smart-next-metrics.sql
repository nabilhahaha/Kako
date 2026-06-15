-- ============================================================================
-- Smart Next Customer — pilot usage metrics (read-only, required metrics only).
--
-- Simple report over the append-only event log (erp_field_ux_events). Run any
-- time to review real pilot usage. No dashboard / module — this query IS the
-- report. Replace the company id to target another tenant.
-- ============================================================================
with ev as (
  select * from erp_field_ux_events
  where company_id = '612af0bd-973c-4fed-8e76-80cf444ef9e0'
),
completed as (
  select nullif(meta->>'durationMs','')::numeric as duration_ms,
         nullif(meta->>'clicks','')::numeric      as clicks,
         nullif(meta->>'transitions','')::numeric as transitions
  from ev where event_type = 'visit_completed'
)
select 'Visit duration (sec, avg)'  as metric, round(avg(duration_ms)/1000.0, 1)::text as value, count(*)::text as sample_n from completed
union all
select 'Click count (per visit, avg)',         round(avg(clicks), 2)::text,      count(*)::text from completed
union all
select 'Page transitions (per visit, avg)',    round(avg(transitions), 2)::text, count(*)::text from completed
union all
select 'Smart Next viewed (count)',  count(*)::text, count(*)::text from ev where event_type = 'smart_next_viewed'
union all
select 'Smart Next used (count)',    count(*)::text, count(*)::text from ev where event_type = 'visit_started' and meta->>'source' = 'smart_next'
union all
select 'Navigate used (count)',      count(*)::text, count(*)::text from ev where event_type = 'navigate_clicked'
union all
select 'Resume Visit shown (count)', count(*)::text, count(*)::text from ev where event_type = 'resume_shown'
union all
select 'Resume Visit used (count)',  count(*)::text, count(*)::text from ev where event_type = 'resume_clicked';
