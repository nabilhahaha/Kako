-- ============================================================================
-- 0031: Pin search_path on SECURITY DEFINER functions that run in restricted
-- session contexts (signup trigger chain, RLS-time helpers, self-register).
-- ----------------------------------------------------------------------------
-- Same class of bug as 0030: a SECURITY DEFINER function that references
-- unqualified object names can fail at runtime when the caller's search_path
-- doesn't include public (e.g. GoTrue /signup, PostgREST). Pinning
-- search_path = public, pg_temp makes them robust and is also the recommended
-- hardening for SECURITY DEFINER functions (prevents search_path hijacking).
-- ALTER FUNCTION ... SET only changes the setting; bodies are unchanged.
-- Idempotent.
-- ============================================================================

ALTER FUNCTION public.erp_guard_profile_privileges()      SET search_path = public, pg_temp;
ALTER FUNCTION public.erp_self_register_company(text, text, text, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.erp_seed_company_roles(uuid)        SET search_path = public, pg_temp;
ALTER FUNCTION public.erp_seed_company_roles_trg()        SET search_path = public, pg_temp;
ALTER FUNCTION public.erp_log_audit(text, text, text, jsonb, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.erp_is_super_admin()                SET search_path = public, pg_temp;
ALTER FUNCTION public.erp_is_platform_owner()             SET search_path = public, pg_temp;
ALTER FUNCTION public.erp_user_company_id()               SET search_path = public, pg_temp;
