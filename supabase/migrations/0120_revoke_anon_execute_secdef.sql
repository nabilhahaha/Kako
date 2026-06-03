-- 0120_revoke_anon_execute_secdef.sql
-- Hardening (H4): remove the UNAUTHENTICATED (anon / PUBLIC) EXECUTE path on
-- every SECURITY DEFINER function in schema `public`, dynamically — covering the
-- functions added after 0070/0071 (erp_record_payment, erp_resolve_price,
-- erp_customer_in_scope, erp_user_company_id, billing/workflow/integration/
-- webhook/sync families, …) that defaulted to the PUBLIC EXECUTE grant and were
-- therefore reachable by `anon` via /rest/v1/rpc/*.
--
-- SAFE-BY-CONSTRUCTION: for each function we capture whether `authenticated` and
-- `service_role` can currently execute it (true even when that access came only
-- through the default PUBLIC grant), then REVOKE EXECUTE FROM anon, PUBLIC and
-- RE-GRANT to exactly those roles that had it. This guarantees:
--   • `anon` / PUBLIC      → lose EXECUTE (closes the gap; anon is not a member
--     of `authenticated`, so it cannot reach the function any longer).
--   • `authenticated`      → keeps EXECUTE iff it had it before (so RLS predicate
--     helpers called during policy evaluation, and every RPC the app calls as
--     `authenticated`, keep working — no app-wide breakage).
--   • `service_role`       → keeps EXECUTE iff it had it before (inbound /api/v1).
-- We do NOT blanket-grant `authenticated`; we only re-assert the pre-existing
-- capability set, so this neither breaks authenticated nor widens any function
-- beyond its prior reach. Scope of this fix is strictly the anon/PUBLIC path.
--
-- search_path: every SECURITY DEFINER function in `public` already pins
-- search_path (verified against the live catalog) — nothing to fix here.
--
-- Idempotent + forward-only: re-running re-asserts the same ACL state.

do $$
declare
  fn record;
  had_auth boolean;
  had_svc  boolean;
begin
  for fn in
    select p.oid, p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef                       -- SECURITY DEFINER only
  loop
    had_auth := has_function_privilege('authenticated', fn.oid, 'EXECUTE');
    had_svc  := has_function_privilege('service_role',  fn.oid, 'EXECUTE');

    execute format('revoke execute on function %s from anon, public', fn.sig);

    if had_auth then
      execute format('grant execute on function %s to authenticated', fn.sig);
    end if;
    if had_svc then
      execute format('grant execute on function %s to service_role', fn.sig);
    end if;
  end loop;
end $$;
