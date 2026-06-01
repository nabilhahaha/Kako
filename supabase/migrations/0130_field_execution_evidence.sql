-- ============================================================================
-- 0130: Field Execution (FE-5a) — photo & evidence pipeline
-- ----------------------------------------------------------------------------
-- Private storage bucket for field evidence + company-scoped storage RLS;
-- evidence metadata reuses erp_entity_attachments (entity = fe_visit / fe_capture,
-- file_path = storage path). A geofence exception photo on a visit is auto-linked
-- as evidence; captured photos (merch/competitor/OOS/opportunity) link on submit.
-- erp_fe_customer_evidence(customer) powers Customer 360 photo visibility.
-- Storage objects are guarded so the migration is safe where storage is absent.
-- Additive + idempotent.
-- ============================================================================

-- ── Private evidence bucket + company-prefixed object RLS (guarded) ─────────
do $evid$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('field-evidence', 'field-evidence', false)
    on conflict (id) do nothing;
  end if;
  if to_regclass('storage.objects') is not null then
    drop policy if exists fe_evidence_read on storage.objects;
    create policy fe_evidence_read on storage.objects for select using (
      bucket_id = 'field-evidence' and ((select erp_is_platform_owner()) or split_part(name, '/', 1) = (select erp_user_company_id())::text));
    drop policy if exists fe_evidence_insert on storage.objects;
    create policy fe_evidence_insert on storage.objects for insert with check (
      bucket_id = 'field-evidence' and (select auth.role()) = 'authenticated' and split_part(name, '/', 1) = (select erp_user_company_id())::text);
    drop policy if exists fe_evidence_delete on storage.objects;
    create policy fe_evidence_delete on storage.objects for delete using (
      bucket_id = 'field-evidence' and ((select erp_is_platform_owner()) or split_part(name, '/', 1) = (select erp_user_company_id())::text));
  end if;
end $evid$;

-- ── Opportunity template gains a photo field (evidence) ────────────────────
insert into erp_form_fields (form_id, key, label_ar, label_en, type, sort_order, required)
select d.id, 'photo', 'صورة', 'Photo', 'image', 4, false
  from erp_form_definitions d where d.key = 'fe_opportunity' and d.company_id is null
on conflict (form_id, key) do nothing;

-- ── Visit geofence photo → evidence attachment ─────────────────────────────
create or replace function erp_fe_visit_photo_evidence()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  if NEW.exception_photo is not null and NEW.exception_photo not like 'local:%'
     and not exists (select 1 from erp_entity_attachments where entity = 'fe_visit' and record_id = NEW.id::text and file_path = NEW.exception_photo) then
    insert into erp_entity_attachments(company_id, entity, record_id, file_name, file_path, mime_type, uploaded_by)
    values (NEW.company_id, 'fe_visit', NEW.id::text, 'geofence-exception', NEW.exception_photo, 'image/jpeg', NEW.rep_id);
  end if;
  return null;
end; $$;
drop trigger if exists trg_fe_visit_photo on erp_fe_visits;
create trigger trg_fe_visit_photo after insert or update of exception_photo on erp_fe_visits
  for each row execute function erp_fe_visit_photo_evidence();

-- ── Customer evidence (visits + captures) for Customer 360 ─────────────────
create or replace function erp_fe_customer_evidence(p_customer uuid, p_limit integer default 30)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare c erp_customers; v_company uuid;
begin
  select * into c from erp_customers where id = p_customer;
  if c.id is null then return '[]'::jsonb; end if;
  v_company := c.company_id;
  if not (
    (select erp_is_platform_owner())
    or (v_company = (select erp_user_company_id()) and (
      (select erp_matrix_has('customers','view')) or (select erp_matrix_has('field_ops','view')) or (select erp_is_company_admin(v_company))))
  ) then raise exception 'forbidden'; end if;

  return coalesce((
    select jsonb_agg(j order by ts desc) from (
      select a.created_at as ts, jsonb_build_object(
        'id', a.id, 'entity', a.entity, 'file_path', a.file_path, 'mime_type', a.mime_type, 'created_at', a.created_at,
        'kind', coalesce(cap.kind, case when a.entity = 'fe_visit' then 'visit' else 'capture' end)
      ) j
      from erp_entity_attachments a
      left join erp_fe_captures cap on a.entity = 'fe_capture' and cap.id = nullif(a.record_id, '')::uuid
      where a.company_id = v_company
        and ((a.entity = 'fe_capture' and cap.customer_id = p_customer)
          or (a.entity = 'fe_visit' and a.record_id in (select id::text from erp_fe_visits where customer_id = p_customer and company_id = v_company)))
      order by a.created_at desc limit greatest(1, least(p_limit, 100))
    ) s
  ), '[]'::jsonb);
end; $$;
revoke all on function erp_fe_customer_evidence(uuid, integer) from public, anon;
grant execute on function erp_fe_customer_evidence(uuid, integer) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_fe_customer_evidence; drop trg_fe_visit_photo +
-- erp_fe_visit_photo_evidence; delete the opportunity photo field; drop the
-- field-evidence storage policies + bucket.
-- ============================================================================
