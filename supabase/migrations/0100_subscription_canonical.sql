-- ============================================================================
-- 0100: Canonical subscription model — single source of truth + projection
-- ----------------------------------------------------------------------------
-- erp_billing_subscriptions becomes the SINGLE source of truth for the
-- subscription lifecycle. erp_companies subscription fields (plan_key, currency,
-- subscription_start/end, trial_ends_at, is_active) become a READ-ONLY CACHE,
-- written ONLY by a one-way projection trigger. erp_plans stays the shared
-- catalog. Access-control read paths are unchanged (they keep reading the cache).
--
-- This migration:
--   1. Adds the projection function + trigger (the ONLY writer of the cache).
--   2. Removes the per-RPC inline company sync from erp_billing_subscribe /
--      erp_billing_set_status (now handled centrally by the trigger).
--   3. Adds discrete owner RPCs the Control Center needs: set_plan,
--      set_period_end, set_trial.
--   4. Backfills one subscription row per tenant from its current cache values,
--      derived to PRESERVE is_active exactly (trial_ends_at is null everywhere
--      today, so every company maps to active/suspended → projection is a no-op).
--
-- Additive + idempotent. No data destroyed. Rollback steps documented at the end.
-- ============================================================================

-- ── 1. Projection: derive the company cache from the canonical subscription ──
-- SECURITY DEFINER so it can write erp_companies regardless of caller (bypasses
-- RLS as a postgres-owned function). One mechanism, one direction.
create or replace function erp_billing_project_subscription()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  update erp_companies c set
    plan_key           = NEW.plan_key,
    currency           = NEW.currency,
    subscription_start = NEW.current_period_start,
    subscription_end   = case when NEW.status = 'trial' then NEW.trial_end
                              else NEW.current_period_end end,
    trial_ends_at      = case when NEW.status = 'trial' then NEW.trial_end
                              else null end,
    is_active          = (NEW.status in ('trial','active'))
  where c.id = NEW.company_id;
  return NEW;
end; $$;

drop trigger if exists trg_billing_project on erp_billing_subscriptions;
create trigger trg_billing_project
  after insert or update on erp_billing_subscriptions
  for each row execute function erp_billing_project_subscription();

-- ── 2. Re-define the two existing RPCs to drop their inline company sync ──────
-- (projection now handled centrally by trg_billing_project). Bodies are
-- otherwise identical to 0086 so behaviour is preserved.

create or replace function erp_billing_subscribe(
  p_company uuid, p_plan_key text, p_currency text, p_interval text, p_trial_days integer default 0)
returns uuid language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_start date := current_date;
  v_period_end date := case when p_interval='yearly' then v_start + interval '1 year' else v_start + interval '1 month' end;
  v_trialing boolean := coalesce(p_trial_days,0) > 0;
  v_trial_end date := case when v_trialing then v_start + (p_trial_days || ' days')::interval else null end;
  v_status text := case when v_trialing then 'trial' else 'active' end;
  v_id uuid;
begin
  if not (select erp_is_platform_owner()) then raise exception 'owner only'; end if;
  insert into erp_billing_subscriptions(company_id, plan_key, currency, interval, status,
     trial_end, current_period_start, current_period_end, created_by)
  values (p_company, p_plan_key, p_currency, p_interval, v_status,
     v_trial_end, v_start, v_period_end, auth.uid())
  on conflict (company_id) do update set
     plan_key = excluded.plan_key, currency = excluded.currency, interval = excluded.interval,
     status = excluded.status, trial_end = excluded.trial_end,
     current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
     updated_at = now()
  returning id into v_id;
  -- company cache kept in sync by trg_billing_project
  perform erp_log_audit('subscribe','billing_subscription', p_company::text,
    jsonb_build_object('plan',p_plan_key,'currency',p_currency,'interval',p_interval,'status',v_status), p_company);
  return v_id;
end; $$;

create or replace function erp_billing_set_status(p_company uuid, p_status text)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  if not (select erp_is_platform_owner()) then raise exception 'owner only'; end if;
  if p_status not in ('trial','active','suspended','cancelled','expired') then
    raise exception 'invalid status'; end if;
  update erp_billing_subscriptions set status = p_status, updated_at = now(),
     cancel_at = case when p_status='cancelled' then current_date else cancel_at end
   where company_id = p_company;
  -- company cache kept in sync by trg_billing_project
  perform erp_log_audit('set_status','billing_subscription', p_company::text,
    jsonb_build_object('status',p_status), p_company);
end; $$;

-- ── 3. Discrete owner RPCs for the Control Center (additive) ──────────────────

-- Change plan only (keeps currency/interval/period/status).
create or replace function erp_billing_set_plan(p_company uuid, p_plan_key text)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  if not (select erp_is_platform_owner()) then raise exception 'owner only'; end if;
  update erp_billing_subscriptions set plan_key = p_plan_key, updated_at = now()
   where company_id = p_company;
  if not found then raise exception 'no subscription'; end if;
  perform erp_log_audit('plan_change','billing_subscription', p_company::text,
    jsonb_build_object('plan',p_plan_key), p_company);
end; $$;

-- Set/extend the paid period end (renew). Reactivates a lapsed/suspended tenant
-- when the new end is in the future (mirrors the previous setSubscriptionEnd).
create or replace function erp_billing_set_period_end(p_company uuid, p_end date)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  if not (select erp_is_platform_owner()) then raise exception 'owner only'; end if;
  if p_end is null then raise exception 'end date required'; end if;
  update erp_billing_subscriptions set
     current_period_end = p_end,
     status = case when status in ('expired','cancelled','suspended') and p_end >= current_date
                   then 'active' else status end,
     updated_at = now()
   where company_id = p_company;
  if not found then raise exception 'no subscription'; end if;
  perform erp_log_audit('renew','billing_subscription', p_company::text,
    jsonb_build_object('end',p_end), p_company);
end; $$;

-- Start a timed trial (days from today), or end it (days <= 0 → active).
create or replace function erp_billing_set_trial(p_company uuid, p_days integer)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_end date;
begin
  if not (select erp_is_platform_owner()) then raise exception 'owner only'; end if;
  if coalesce(p_days,0) > 0 then
    v_end := current_date + (least(p_days,365) || ' days')::interval;
    update erp_billing_subscriptions set status='trial', trial_end = v_end, updated_at = now()
     where company_id = p_company;
  else
    update erp_billing_subscriptions
       set status = case when status='trial' then 'active' else status end,
           trial_end = null, updated_at = now()
     where company_id = p_company;
  end if;
  if not found then raise exception 'no subscription'; end if;
  perform erp_log_audit(case when coalesce(p_days,0) > 0 then 'enable' else 'disable' end,
    'company_trial', p_company::text, jsonb_build_object('days',p_days), p_company);
end; $$;

revoke all on function erp_billing_set_plan(uuid,text) from public, anon;
revoke all on function erp_billing_set_period_end(uuid,date) from public, anon;
revoke all on function erp_billing_set_trial(uuid,integer) from public, anon;
grant execute on function erp_billing_set_plan(uuid,text) to authenticated;
grant execute on function erp_billing_set_period_end(uuid,date) to authenticated;
grant execute on function erp_billing_set_trial(uuid,integer) to authenticated;

-- ── 4. Backfill: one subscription per tenant, mirroring current cache values ──
-- Status is derived to PRESERVE is_active exactly. trial_ends_at is null on every
-- company today, so no row maps to 'trial' here → projection reproduces the
-- current plan_key / subscription_end / is_active verbatim (a no-op).
insert into erp_billing_subscriptions
  (company_id, plan_key, currency, interval, status, trial_end, current_period_start, current_period_end)
select
  c.id,
  coalesce(c.plan_key, 'standard'),
  case when c.currency in ('SAR','AED','KWD','QAR','BHD','OMR','EGP','USD') then c.currency else 'EGP' end,
  'monthly',
  case
    when c.is_active = false then 'suspended'
    when c.trial_ends_at is not null and c.trial_ends_at >= current_date then 'trial'
    else 'active'
  end,
  c.trial_ends_at,
  c.subscription_start,
  c.subscription_end
from erp_companies c
where not exists (select 1 from erp_billing_subscriptions s where s.company_id = c.id);

-- ============================================================================
-- ROLLBACK (manual; NOT auto-applied). Reverses this migration safely:
--   drop trigger if exists trg_billing_project on erp_billing_subscriptions;
--   drop function if exists erp_billing_project_subscription();
--   drop function if exists erp_billing_set_plan(uuid,text);
--   drop function if exists erp_billing_set_period_end(uuid,date);
--   drop function if exists erp_billing_set_trial(uuid,integer);
--   -- (Optionally restore the 0086 inline-sync bodies of erp_billing_subscribe
--   --  and erp_billing_set_status from migration 0086.)
--   -- Backfilled erp_billing_subscriptions rows may be kept (harmless) or removed.
-- The erp_companies cache columns remain intact and authoritative throughout,
-- so access control is never at risk during or after rollback.
-- ============================================================================
