-- 0314 — Backend-Enforcement Phase D: in-function permission checks on sensitive
-- financial / transactional RPCs.
--
-- WHY: ROLE-PERMISSION-AUDIT (§D) found that several SECURITY DEFINER mutation
-- RPCs are EXECUTE-able by `authenticated` directly (PostgREST) yet do NOT check
-- the caller's permission in-function — they trust the calling route/server
-- action. Because SECURITY DEFINER bypasses RLS, a crafted direct call could run
-- the mutation without the permission the UI requires.
--
-- WHAT: a flag-gated guard (`erp_guard_rpc`) is injected at the top of each target
-- RPC. It is a NO-OP unless `platform.rpc_authz_enforcement` is enabled for the
-- caller's company, so the default behaviour everywhere is unchanged. When ON, the
-- guard verifies the caller holds the same permission the calling action already
-- requires (platform owner / super admin bypass is built into erp_user_has_perm).
--
-- REVERSIBLE: disable instantly by toggling the company flag OFF (the guard
-- no-ops); full removal = restore the prior function definitions. Additive; no
-- schema/data change. STAGING ONLY — the flag is enabled per-company, never by a
-- template default (catalog template = []), so production tenants are unaffected.

-- ── Flag check (per-company, SECURITY DEFINER so it reads the flag past RLS) ──
create or replace function erp_rpc_authz_enabled()
returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce((
    select f.enabled
      from erp_feature_flags f
     where f.company_id = erp_user_company_id()
       and f.feature_key = 'platform.rpc_authz_enforcement'
     limit 1), false);
$fn$;

comment on function erp_rpc_authz_enabled() is
  'True when platform.rpc_authz_enforcement is enabled for the caller''s company. Gates erp_guard_rpc.';

-- ── The guard: pass if flag OFF (no-op), or caller holds ANY of the perms ──
create or replace function erp_guard_rpc(variadic p_perms text[])
returns void
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $fn$
declare p text;
begin
  -- Flag OFF for this company → behave exactly as before (no enforcement).
  if not erp_rpc_authz_enabled() then
    return;
  end if;
  -- erp_user_has_perm() already returns true for platform owner / super admin.
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
  'Defense-in-depth permission gate for sensitive RPCs. No-op unless the company flag platform.rpc_authz_enforcement is ON.';

-- ── Inject the guard into each target RPC ────────────────────────────────────
-- Each function has exactly one top-level `\nBEGIN\n` token (verified), so the
-- guard is inserted unambiguously right after the main BEGIN. Idempotent: a
-- function that already references erp_guard_rpc is skipped. A function whose
-- BEGIN marker is not found raises (fail-loud; CREATE OR REPLACE is transactional).
do $mig$
declare
  r       record;
  v_def   text;
  v_new   text;
  v_args  text;
begin
  for r in
    select * from (values
      ('erp_issue_invoice(uuid)',                                                  'sales.sell'),
      ('erp_record_payment(uuid,numeric,erp_payment_method,text,date,uuid)',       'sales.collect'),
      ('erp_record_supplier_payment(uuid,uuid,numeric,erp_payment_method,text,date)', 'accounting.post,suppliers.manage'),
      ('erp_post_payment_voucher(uuid)',                                           'accounting.post'),
      ('erp_post_receipt_voucher(uuid)',                                           'accounting.post'),
      ('erp_approve_stock_request(uuid)',                                          'stock_request.approve'),
      ('erp_van_sell(uuid,uuid,jsonb,uuid,date,text)',                             'field.sales'),
      ('erp_van_sell_with_payment(uuid,uuid,jsonb,jsonb,uuid,date,text)',          'field.sales'),
      ('erp_settle_collection(uuid,uuid,numeric,text,text,jsonb,uuid,date)',       'sales.collect'),
      ('erp_van_return(uuid,uuid,jsonb,uuid,uuid,boolean,text,uuid)',              'field.sales')
    ) as t(sig, perms)
  loop
    v_def := pg_get_functiondef(r.sig::regprocedure);

    -- Idempotent: already guarded → skip.
    if position('erp_guard_rpc(' in v_def) > 0 then
      continue;
    end if;

    -- Build the quoted permission argument list.
    select string_agg(quote_literal(trim(p)), ', ')
      into v_args
      from unnest(string_to_array(r.perms, ',')) as p;

    v_new := replace(
      v_def,
      E'\nBEGIN\n',
      E'\nBEGIN\n  PERFORM erp_guard_rpc(' || v_args || E');\n'
    );

    if v_new = v_def then
      raise exception 'erp_guard_rpc injection failed: no BEGIN marker in %', r.sig;
    end if;

    execute v_new;
  end loop;
end
$mig$;
