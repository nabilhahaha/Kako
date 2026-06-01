-- ============================================================================
-- 0119: Field Execution (FE-1) — foundations under the field_ops capability
-- ----------------------------------------------------------------------------
-- Backend foundations for the Field Execution Pack, delivered under the existing
-- dedicated `field_ops` capability module (independent of distribution):
--   • erp_fe_settings           — per-company config (geofence, coverage target)
--   • field_ops permission set  — view / execute / plan / approve / dashboard
--   • notification templates    — route published / missed / geofence / coverage / competitor
--   • erp_customer_field_360     — raw-facts-driven Field Execution rollup for 360
-- In-field capture rides Builder forms + the generic `emit_fact` effect (app
-- layer) → erp_raw_emit('field_ops', …). Additive + idempotent.
-- ============================================================================

-- ── Per-company Field Execution settings ───────────────────────────────────
create table if not exists erp_fe_settings (
  company_id              uuid primary key references erp_companies(id) on delete cascade,
  geofence_radius_m       integer not null default 150,
  geofence_mode           text not null default 'advisory' check (geofence_mode in ('advisory','blocking')),
  geofence_photo_threshold_m integer not null default 500,  -- beyond this, an exception photo is required
  coverage_target_pct     integer not null default 80,
  workday_start           time,
  workday_end             time,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
alter table erp_fe_settings enable row level security;
drop policy if exists erp_fe_settings_read on erp_fe_settings;
create policy erp_fe_settings_read on erp_fe_settings for select using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
);
drop policy if exists erp_fe_settings_write on erp_fe_settings;
create policy erp_fe_settings_write on erp_fe_settings for all using (
  (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
) with check (
  (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
);
-- audit + updated_at
drop trigger if exists trg_audit_erp_fe_settings on erp_fe_settings;
create trigger trg_audit_erp_fe_settings after insert or update or delete on erp_fe_settings
  for each row execute function erp_audit_capture();
drop trigger if exists erp_fe_settings_updated on erp_fe_settings;
create trigger erp_fe_settings_updated before update on erp_fe_settings
  for each row execute function erp_set_updated_at();

-- ── Permission catalog: field_ops resource ─────────────────────────────────
-- Extend the allowed action vocabulary (additive) for operational capabilities.
alter table erp_permission_catalog drop constraint if exists erp_permission_catalog_action_check;
alter table erp_permission_catalog add constraint erp_permission_catalog_action_check
  check (action in ('view','create','edit','approve','export','delete','execute','plan','dashboard'));

insert into erp_permission_catalog (key, resource, action, module, name_ar, name_en) values
  ('field_ops:view',     'field_ops','view',     'field_ops','العمليات الميدانية — عرض',     'Field Ops — View'),
  ('field_ops:execute',  'field_ops','execute',  'field_ops','العمليات الميدانية — تنفيذ',    'Field Ops — Execute'),
  ('field_ops:plan',     'field_ops','plan',     'field_ops','العمليات الميدانية — تخطيط',    'Field Ops — Plan'),
  ('field_ops:approve',  'field_ops','approve',  'field_ops','العمليات الميدانية — اعتماد',   'Field Ops — Approve'),
  ('field_ops:dashboard','field_ops','dashboard','field_ops','العمليات الميدانية — لوحات',    'Field Ops — Dashboards')
on conflict (key) do nothing;

-- Grants (global defaults; companies can override in the matrix)
insert into erp_matrix_role_permissions (company_id, role_key, permission)
  select null, 'admin', key from erp_permission_catalog where resource='field_ops' on conflict do nothing;
insert into erp_matrix_role_permissions (company_id, role_key, permission) values
  (null,'manager','field_ops:view'),(null,'manager','field_ops:plan'),
  (null,'manager','field_ops:approve'),(null,'manager','field_ops:dashboard')
on conflict do nothing;
-- Field roles that exist get view + execute (join guards against missing roles).
insert into erp_matrix_role_permissions (company_id, role_key, permission)
  select null, r.key, p.key
    from erp_roles r
    join erp_permission_catalog p on p.resource='field_ops' and p.action in ('view','execute')
   where r.key in ('rep','salesman','sales_rep','merchandiser','delivery','driver','supervisor')
on conflict do nothing;

-- ── Notification templates (in-app) ────────────────────────────────────────
insert into erp_notification_templates (key, event_type, title_ar, title_en, body_ar, body_en, channels) values
  ('fe_route_published','field_ops','تم نشر خط سيرك','Your route is ready','تم نشر خط سير اليوم.','Your route plan for today has been published.','{in_app}'),
  ('fe_visit_missed','field_ops','زيارة فائتة','Missed visit','تم تفويت زيارة مخططة.','A planned visit was missed.','{in_app}'),
  ('fe_geofence_violation','field_ops','تنبيه نطاق جغرافي','Geofence alert','تسجيل دخول خارج النطاق الجغرافي.','A check-in occurred outside the customer geofence.','{in_app}'),
  ('fe_coverage_low','field_ops','تغطية منخفضة','Coverage below target','نسبة التغطية أقل من المستهدف.','Route coverage is below the target.','{in_app}'),
  ('fe_competitor_alert','field_ops','رصد منافس','Competitor activity','تم رصد نشاط منافس.','Competitor activity was captured in the field.','{in_app}')
on conflict (key) do nothing;

-- ── Customer 360 companion: Field Execution rollup (raw-facts driven) ───────
create or replace function erp_customer_field_360(p_customer uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare c erp_customers; v_company uuid;
begin
  select * into c from erp_customers where id = p_customer;
  if c.id is null then return null; end if;
  v_company := c.company_id;
  if not (
    (select erp_is_platform_owner())
    or (v_company = (select erp_user_company_id())
        and ((select erp_matrix_has('customers','view')) or (select erp_is_company_admin(v_company))))
  ) then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'last_visit_at',         (select max(event_at) from erp_raw_facts where company_id=v_company and customer_id=p_customer and module='field_ops' and event_type='fe_visit_completed'),
    'visits_30d',            (select count(*)       from erp_raw_facts where company_id=v_company and customer_id=p_customer and module='field_ops' and event_type='fe_visit_completed' and event_at > now() - interval '30 days'),
    'last_geofence_status',  (select geofence_result from erp_raw_facts where company_id=v_company and customer_id=p_customer and module='field_ops' and event_type='fe_visit_checkin' order by event_at desc limit 1),
    'last_merch_at',         (select max(event_at)   from erp_raw_facts where company_id=v_company and customer_id=p_customer and module='field_ops' and event_type='fe_merchandising'),
    'last_competitor_price', (select amount          from erp_raw_facts where company_id=v_company and customer_id=p_customer and module='field_ops' and event_type='fe_competitor' order by event_at desc limit 1)
  );
end; $$;
revoke all on function erp_customer_field_360(uuid) from public, anon;
grant execute on function erp_customer_field_360(uuid) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_customer_field_360; delete the fe_* templates and
-- field_ops catalog/grant rows; drop table erp_fe_settings.
-- ============================================================================
