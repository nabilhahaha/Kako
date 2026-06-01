-- ============================================================================
-- 0118: Builder pre-pack improvements — entity_ref field + submitter notices
-- ----------------------------------------------------------------------------
-- Additive Builder capabilities ahead of FMCG Pack #1:
--   1. entity_ref field type  — a typed reference picker (e.g. customer), whose
--      stored value is the referenced row id. Pairs with subject_ref source=field
--      so any customer-related form can route to its owner with a real picker UX.
--      Per-field config lives in erp_form_fields.config jsonb, e.g. {"entity":"customer"}.
--   2. update_fields effect    — multi-column update (app-layer; no schema here).
--   3. submitter notifications — templates for the approve/reject notice sent to
--      the form's submitter on workflow completion (via erp_notify_send).
-- Idempotent.
-- ============================================================================

-- ── 1. entity_ref field type + per-field config ────────────────────────────
alter table erp_form_fields add column if not exists config jsonb;

alter table erp_form_fields drop constraint if exists erp_form_fields_type_check;
alter table erp_form_fields add constraint erp_form_fields_type_check
  check (type in ('text','number','date','dropdown','multiselect','attachment','image','gps','signature','section','entity_ref'));

-- Versioning clone must carry the new per-field config (+ subject_ref on defs).
create or replace function erp_form_new_version(p_form uuid)
returns uuid language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare d erp_form_definitions; v_new uuid;
begin
  select * into d from erp_form_definitions where id = p_form;
  if d.id is null then raise exception 'form not found'; end if;
  if not ((select erp_is_platform_owner()) or (d.company_id is not null and (select erp_is_company_admin(d.company_id)))) then
    raise exception 'forbidden';
  end if;
  update erp_form_definitions set is_latest = false where company_id is not distinct from d.company_id and key = d.key;
  insert into erp_form_definitions(company_id, key, name_ar, name_en, module, target_entity, workflow_key, effect, subject_ref, status, version, is_latest, created_by)
  values (d.company_id, d.key, d.name_ar, d.name_en, d.module, d.target_entity, d.workflow_key, d.effect, d.subject_ref, 'draft', d.version + 1, true, auth.uid())
  returning id into v_new;
  insert into erp_form_fields(form_id, key, label_ar, label_en, type, section, sort_order, required, options, validation, visibility, config, default_value)
  select v_new, key, label_ar, label_en, type, section, sort_order, required, options, validation, visibility, config, default_value
    from erp_form_fields where form_id = p_form;
  return v_new;
end; $$;
revoke all on function erp_form_new_version(uuid) from public, anon;
grant execute on function erp_form_new_version(uuid) to authenticated;

-- ── 3. Submitter outcome notification templates (in-app) ───────────────────
insert into erp_notification_templates (key, event_type, title_ar, title_en, body_ar, body_en, channels) values
  ('form_approved','forms','تم اعتماد طلبك','Your request was approved','تمت الموافقة على طلبك.','Your submitted request has been approved.','{in_app}'),
  ('form_rejected','forms','تم رفض طلبك','Your request was rejected','تم رفض طلبك.','Your submitted request has been rejected.','{in_app}')
on conflict (key) do nothing;

-- ============================================================================
-- ROLLBACK (manual): delete the form_approved / form_rejected templates; restore
-- the 0114 erp_form_fields_type_check (without 'entity_ref'); drop erp_form_fields.config.
-- ============================================================================
