-- ============================================================================
-- 0085: Revoke anon/public EXECUTE on the platform trigger functions (0083).
-- ----------------------------------------------------------------------------
-- Supabase default-privileges auto-grant EXECUTE to anon/authenticated on new
-- public functions. The 0083 helper functions were revoked, but the trigger
-- functions were not. They are NOT exploitable (Postgres refuses to call a
-- trigger function directly — "can only be called as triggers") and triggers
-- fire regardless of EXECUTE grants, but the security advisor flags them, so we
-- revoke to keep the hardened baseline clean. Additive, safe to re-run.
-- ============================================================================
revoke all on function erp_platform_staff_guard()      from public, anon, authenticated;
revoke all on function erp_platform_staff_perm_guard() from public, anon, authenticated;
revoke all on function erp_platform_staff_audit()      from public, anon, authenticated;
revoke all on function erp_platform_perm_audit()       from public, anon, authenticated;
revoke all on function erp_platform_role_perm_audit()  from public, anon, authenticated;
