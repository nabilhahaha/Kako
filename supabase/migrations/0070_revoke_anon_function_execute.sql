-- 0070_revoke_anon_function_execute.sql
-- Defense-in-depth for the `anon_security_definer_function_executable` advisor.
--
-- Supabase's default privileges grant EXECUTE on every public function to
-- `anon` and `authenticated`, so each SECURITY DEFINER business function was
-- reachable by unauthenticated callers via /rest/v1/rpc/*. Every such function
-- already guards itself internally (auth.uid()/role checks), so nothing was
-- exploitable — but an unauthenticated request should not reach the body at all.
--
-- Strategy:
--   • business / admin / data-returning functions → revoke from anon
--     (the app calls them as `authenticated`, which keeps EXECUTE).
--   • internal-only and trigger functions → revoke from anon, authenticated and
--     public (they run with definer/trigger rights and are never called by the
--     app via RPC).
--   • the pure RLS predicate helpers (erp_user_company_id, erp_is_platform_owner,
--     …) are intentionally LEFT executable: policies run `TO public`, so anon
--     must be able to evaluate them; they return null/false for anon and leak
--     nothing.

-- ── Business operations (revoke anon, keep authenticated) ──────────────────
revoke execute on function public.erp_issue_invoice(uuid) from anon;
revoke execute on function public.erp_record_payment(uuid, numeric, public.erp_payment_method, text, date) from anon;
revoke execute on function public.erp_record_supplier_payment(uuid, uuid, numeric, public.erp_payment_method, text, date) from anon;
revoke execute on function public.erp_post_payment_voucher(uuid) from anon;
revoke execute on function public.erp_post_receipt_voucher(uuid) from anon;
revoke execute on function public.erp_collect_clinic_fee(uuid, numeric) from anon;
revoke execute on function public.erp_close_restaurant_order(uuid, text) from anon;
revoke execute on function public.erp_close_salon_ticket(uuid, text) from anon;
revoke execute on function public.erp_close_laundry_order(uuid, text) from anon;
revoke execute on function public.erp_complete_sales_return(uuid) from anon;
revoke execute on function public.erp_complete_transfer(uuid) from anon;
revoke execute on function public.erp_receive_purchase_order(uuid, uuid, jsonb) from anon;
revoke execute on function public.erp_finalize_stock_count(uuid) from anon;
revoke execute on function public.erp_approve_stock_request(uuid) from anon;
revoke execute on function public.erp_seed_company_modules(uuid) from anon;
revoke execute on function public.erp_seed_company_roles(uuid) from anon;
revoke execute on function public.erp_log_audit(text, text, text, jsonb, uuid) from anon;

-- ── Admin / staff management (revoke anon, keep authenticated) ─────────────
revoke execute on function public.erp_admin_set_password(uuid, text) from anon;
revoke execute on function public.erp_set_staff_password(uuid, text) from anon;
revoke execute on function public.erp_set_staff_active(uuid, boolean) from anon;
revoke execute on function public.erp_self_register_company(text, text, text, integer) from anon;

-- ── Data-returning definer helpers (revoke anon, keep authenticated) ───────
revoke execute on function public.erp_company_staff() from anon;
revoke execute on function public.erp_company_reps() from anon;
revoke execute on function public.erp_clinic_doctors() from anon;
revoke execute on function public.erp_salon_staff() from anon;
revoke execute on function public.erp_product_fefo_batch(uuid) from anon;

-- ── Internal-only + trigger functions (revoke from everyone) ───────────────
revoke execute on function public.erp_post_revenue(uuid, uuid, numeric, text, text, text, uuid, text) from anon, authenticated, public;
revoke execute on function public.erp_auto_confirm_email() from anon, authenticated, public;
revoke execute on function public.erp_guard_profile_privileges() from anon, authenticated, public;
revoke execute on function public.erp_handle_new_user() from anon, authenticated, public;
revoke execute on function public.erp_seed_company_roles_trg() from anon, authenticated, public;
