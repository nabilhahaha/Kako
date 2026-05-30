-- 0071_revoke_public_function_execute.sql
-- Corrects 0070: anon reaches these functions through the PUBLIC grant (the
-- `=X` ACL entry), not an explicit anon grant — so revoking from `anon` alone
-- was a no-op. The right move is to revoke EXECUTE from PUBLIC. Each function is
-- first (idempotently) granted to `authenticated` so the app keeps working
-- regardless of how the original grant was structured; revoking PUBLIC then
-- removes the unauthenticated path while leaving `authenticated`/`service_role`
-- explicit grants intact.

do $$
declare
  fn text;
  fns text[] := array[
    -- business operations
    'erp_issue_invoice(uuid)',
    'erp_record_payment(uuid, numeric, public.erp_payment_method, text, date)',
    'erp_record_supplier_payment(uuid, uuid, numeric, public.erp_payment_method, text, date)',
    'erp_post_payment_voucher(uuid)',
    'erp_post_receipt_voucher(uuid)',
    'erp_collect_clinic_fee(uuid, numeric)',
    'erp_close_restaurant_order(uuid, text)',
    'erp_close_salon_ticket(uuid, text)',
    'erp_close_laundry_order(uuid, text)',
    'erp_complete_sales_return(uuid)',
    'erp_complete_transfer(uuid)',
    'erp_receive_purchase_order(uuid, uuid, jsonb)',
    'erp_finalize_stock_count(uuid)',
    'erp_approve_stock_request(uuid)',
    'erp_seed_company_modules(uuid)',
    'erp_seed_company_roles(uuid)',
    'erp_log_audit(text, text, text, jsonb, uuid)',
    -- admin / staff management
    'erp_admin_set_password(uuid, text)',
    'erp_set_staff_password(uuid, text)',
    'erp_set_staff_active(uuid, boolean)',
    'erp_self_register_company(text, text, text, integer)',
    -- data-returning definer helpers
    'erp_company_staff()',
    'erp_company_reps()',
    'erp_clinic_doctors()',
    'erp_salon_staff()',
    'erp_product_fefo_batch(uuid)'
  ];
begin
  foreach fn in array fns loop
    execute format('grant execute on function public.%s to authenticated', fn);
    execute format('revoke execute on function public.%s from public, anon', fn);
  end loop;
end $$;
