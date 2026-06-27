-- =====================================================================
-- Roshen KSA — 0014 import_batch_totals view (perf)
--
-- The batch detail page previously loaded ALL sales_fact rows for a batch
-- into the app just to count + sum them (90k+ rows). This view does the
-- aggregate in Postgres (one row per batch, served via the sales_fact
-- batch_id index). security_invoker keeps the caller's RLS.
--
-- Additive (view only). No data change.
-- =====================================================================

create or replace view import_batch_totals as
select
  batch_id,
  count(*)::bigint                          as fact_rows,
  sum(coalesce(sla_actual_value, 0))        as sla_total
from sales_fact
group by batch_id;

alter view import_batch_totals set (security_invoker = on);
