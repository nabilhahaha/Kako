-- 0317 — Fix: RPC guard must authorize at the ENTRY POINT, not on nested calls.
--
-- Regression from 0314: erp_van_sell / erp_van_sell_with_payment call
-- erp_issue_invoice INTERNALLY. SECURITY DEFINER does not change auth.uid(), so
-- the nested erp_issue_invoice guard (requires sales.sell) ran against the van
-- rep — who is authorized for the van path by field.sales but intentionally
-- lacks sales.sell — and aborted the sale with 42501 ("permission denied").
--
-- Fix: erp_guard_rpc enforces only for the OUTERMOST guarded RPC in a
-- transaction (the entry point the caller actually invoked). Nested building-block
-- RPCs trust the entry point's authorization. A transaction-local GUC marks that
-- the entry guard already ran; PostgREST runs each RPC in its own transaction, so
-- direct calls are always the entry point and remain fully enforced.

create or replace function erp_guard_rpc(variadic p_perms text[])
returns void
language plpgsql volatile security definer set search_path to 'public', 'pg_temp'
as $fn$
declare p text;
begin
  if not erp_rpc_authz_enabled() then
    return;
  end if;
  -- Entry-point authorization: the first guarded RPC in this transaction enforces;
  -- nested ones (e.g. erp_issue_invoice inside erp_van_sell) trust that check.
  if current_setting('kako.rpc_guarded', true) = '1' then
    return;
  end if;
  perform set_config('kako.rpc_guarded', '1', true);
  foreach p in array p_perms loop
    if erp_user_has_perm(p) then
      return;
    end if;
  end loop;
  raise exception 'permission_denied: this action requires one of: %', array_to_string(p_perms, ', ')
    using errcode = '42501';
end;
$fn$;

comment on function erp_guard_rpc(text[]) is
  'Defense-in-depth permission gate for sensitive RPCs. No-op unless platform.rpc_authz_enforcement is ON. Enforces only at the outermost (entry-point) guarded RPC per transaction; nested building-block RPCs trust the entry check.';
