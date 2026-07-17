-- Trade Spend Native Module — 005: security hardening (APPLIED as ts_module_005)
-- Advisor: function_search_path_mutable. Pin the search_path on the final-approval
-- trigger so a role-mutable search_path can't shadow objects it references.
alter function public.enforce_final_approval() set search_path = public, pg_temp;
