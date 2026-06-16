-- Field Insights — Phase 1: extensions, enums, shared helpers
-- Applied to the standalone field-insights Supabase project ONLY.

create extension if not exists pgcrypto;

-- ---- Enums -------------------------------------------------------------
create type user_role as enum (
  'platform_admin','business_manager','regional_manager',
  'area_manager','supervisor','field_user','viewer'
);

create type visit_type as enum (
  'follow_up','new_customer','competitor_check','market_survey',
  'merchandising_audit','complaint_investigation','trade_marketing_visit','distributor_visit'
);
create type visit_status as enum ('draft','in_progress','completed','cancelled');

create type photo_category as enum (
  'store_front','shelf','display','promotion',
  'competitor_activity','price_tag','product_availability','other'
);

create type opportunity_status as enum ('open','in_progress','closed_won','closed_lost');
create type priority_level    as enum ('low','medium','high','critical');

create type issue_type as enum (
  'out_of_stock','pricing_issue','distribution_issue',
  'visibility_issue','customer_complaint','competitor_threat'
);
create type severity_level as enum ('low','medium','high','critical');
create type issue_status   as enum ('open','in_progress','resolved','closed');

create type action_status   as enum ('not_started','in_progress','completed','cancelled');
create type display_quality as enum ('poor','fair','good','excellent');
create type sync_status     as enum ('pending','synced','failed');

create type follow_up_type   as enum ('callback','next_visit','task','escalation');
create type follow_up_status as enum ('scheduled','in_progress','done','cancelled');

-- FMCG intelligence layer
create type customer_dev_stage     as enum ('prospect','onboarding','developing','established','strategic','at_risk','dormant');
create type customer_health_status as enum ('healthy','watch','at_risk','critical');

-- ---- Shared trigger: maintain updated_at -------------------------------
create or replace function fi_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
