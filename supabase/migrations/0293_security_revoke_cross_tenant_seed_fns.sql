-- ============================================================================
-- 0293 — SECURITY: revoke direct EXECUTE on cross-tenant seed functions
-- ----------------------------------------------------------------------------
-- ROOT CAUSE (audit BL-3 / BL-4)
--   erp_seed_fashion_role_perms(uuid), erp_seed_company_roles(uuid) and
--   erp_seed_company_modules(uuid) are SECURITY DEFINER functions that take a
--   caller-supplied company_id and write that company's role→permission set
--   (BL-3 issues an UNCONDITIONAL DELETE first) / roles / modules, with NO
--   caller-vs-tenant check. They were GRANTed to `authenticated`, so any logged-in
--   user of any tenant could pass a victim company's id and wipe (BL-3) or
--   re-seed/pollute (BL-4) that tenant's RBAC and module visibility.
--
-- FIX
--   Revoke EXECUTE from authenticated / public / anon. These functions are ONLY
--   ever invoked by AFTER-INSERT triggers on erp_companies — and every one of
--   those trigger functions is SECURITY DEFINER (0021/0036/0147/0148), so the
--   inner PERFORM runs as the function OWNER, not the invoking user, and keeps
--   working after this revoke. No application code calls them directly (verified:
--   zero `.rpc('erp_seed_*')` call sites). `service_role` retains EXECUTE.
--
-- SAFETY
--   • Non-destructive: no rows, columns, policies, or function bodies changed.
--   • Cannot break onboarding: trigger path runs as definer/owner.
--   • Idempotent: REVOKE of an absent grant is a no-op.
--
-- REVERSAL (restores the prior over-broad grants)
--   GRANT EXECUTE ON FUNCTION public.erp_seed_fashion_role_perms(uuid) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.erp_seed_company_roles(uuid)        TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.erp_seed_company_modules(uuid)      TO authenticated;
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.erp_seed_fashion_role_perms(uuid) FROM authenticated, public, anon;
REVOKE EXECUTE ON FUNCTION public.erp_seed_company_roles(uuid)      FROM authenticated, public, anon;
REVOKE EXECUTE ON FUNCTION public.erp_seed_company_modules(uuid)    FROM authenticated, public, anon;
