-- ============================================================================
-- Validation — Backend-Enforcement Phase D (migration 0314): in-function
-- permission guards on sensitive financial / transactional RPCs.
--
-- Re-runnable, NON-DESTRUCTIVE. It temporarily enables the flag for the target
-- company, impersonates each role's user via auth.uid(), calls erp_guard_rpc for
-- every guarded RPC, asserts the guard's allow/deny matches the role's grants,
-- then restores the prior flag state (nothing persists). Raises on any mismatch.
--
-- Usage: set :company below (defaults to the pilot tenant). The role→user map is
-- resolved from erp_user_branches, so it adapts to whoever is provisioned.
-- ============================================================================
do $t$
declare
  pilot uuid := '612af0bd-973c-4fed-8e76-80cf444ef9e0';  -- target company
  rpcs jsonb := '[
    {"n":"erp_issue_invoice","p":["sales.sell"]},
    {"n":"erp_record_payment","p":["sales.collect"]},
    {"n":"erp_record_supplier_payment","p":["accounting.post","suppliers.manage"]},
    {"n":"erp_post_payment_voucher","p":["accounting.post"]},
    {"n":"erp_post_receipt_voucher","p":["accounting.post"]},
    {"n":"erp_approve_stock_request","p":["stock_request.approve"]},
    {"n":"erp_van_sell","p":["field.sales"]},
    {"n":"erp_van_sell_with_payment","p":["field.sales"]},
    {"n":"erp_settle_collection","p":["sales.collect"]},
    {"n":"erp_van_return","p":["field.sales"]}
  ]';
  v_user record; rc jsonb; v_perms text[];
  v_expected boolean; v_actual boolean;
  v_existed boolean; v_prev boolean; v_fail int := 0; v_pass int := 0;
begin
  -- Capture the flag's prior state so the proof can restore it exactly.
  select enabled into v_prev from erp_feature_flags
    where company_id=pilot and feature_key='platform.rpc_authz_enforcement';
  v_existed := found;
  -- Enable the flag for the duration of the proof.
  update erp_feature_flags set enabled=true where company_id=pilot and feature_key='platform.rpc_authz_enforcement';
  if not v_existed then
    insert into erp_feature_flags(company_id,feature_key,enabled) values (pilot,'platform.rpc_authz_enforcement',true);
  end if;

  for v_user in
    select distinct ub.role, ub.user_id
      from erp_user_branches ub join erp_branches b on b.id=ub.branch_id
     where b.company_id=pilot
  loop
    perform set_config('request.jwt.claim.sub', v_user.user_id::text, true);
    for rc in select jsonb_array_elements(rpcs) loop
      v_perms := array(select jsonb_array_elements_text(rc->'p'));
      select exists(select 1 from erp_company_role_permissions
                    where company_id=pilot and role_key=v_user.role and permission = any(v_perms)) into v_expected;
      -- Each assertion simulates an independent (entry-point) RPC call: reset the
      -- transaction-local guard marker so every call enforces (real calls are 1/txn).
      perform set_config('kako.rpc_guarded', '', true);
      begin
        perform erp_guard_rpc(variadic v_perms);
        v_actual := true;                       -- allowed
      exception when sqlstate '42501' then
        v_actual := false;                      -- denied
      end;
      if v_actual is distinct from v_expected then
        v_fail := v_fail + 1;
        raise notice 'MISMATCH role=% rpc=% expected=% actual=%', v_user.role, rc->>'n', v_expected, v_actual;
      else
        v_pass := v_pass + 1;
        raise notice 'OK role=% rpc=% -> %', v_user.role, rc->>'n', case when v_actual then 'ALLOW' else 'DENY' end;
      end if;
    end loop;
  end loop;

  -- Also prove flag-OFF is a safe no-op (default behaviour unchanged).
  update erp_feature_flags set enabled=false where company_id=pilot and feature_key='platform.rpc_authz_enforcement';
  perform set_config('request.jwt.claim.sub',
    (select ub.user_id::text from erp_user_branches ub join erp_branches b on b.id=ub.branch_id
      where b.company_id=pilot order by ub.role limit 1), true);
  begin
    perform erp_guard_rpc('field.sales');       -- any user passes when flag OFF
    v_pass := v_pass + 1;
  exception when sqlstate '42501' then
    v_fail := v_fail + 1; raise notice 'FLAG-OFF NO-OP FAILED';
  end;

  -- Restore prior state exactly (delete if it never existed, else restore enabled).
  perform set_config('request.jwt.claim.sub', '', true);
  if not v_existed then
    delete from erp_feature_flags where company_id=pilot and feature_key='platform.rpc_authz_enforcement';
  else
    update erp_feature_flags set enabled=v_prev where company_id=pilot and feature_key='platform.rpc_authz_enforcement';
  end if;

  raise notice 'RPC-AUTHZ VALIDATION: % passed, % failed', v_pass, v_fail;
  if v_fail > 0 then
    raise exception 'RPC-AUTHZ VALIDATION FAILED (% mismatches)', v_fail;
  end if;
end
$t$;
