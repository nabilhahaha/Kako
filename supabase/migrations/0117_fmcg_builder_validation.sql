-- ============================================================================
-- 0117: Builder validation — three FMCG processes as configuration (+ engine fix)
-- ----------------------------------------------------------------------------
-- Validates the Dynamic Form & Workflow Builder against three real FMCG
-- business processes using CONFIGURATION ONLY (global form templates + bound
-- workflows + whitelisted effects):
--   1. New Customer Request   → effect create_customer, company_admin approval
--   2. Customer Data Update    → effect update_field,    account_owner approval
--   3. GPS Correction Request  → effect set_gps,         route_owner  approval
--
-- ENGINE FIX (generic, the only non-config change): the owner-resolver
-- erp_workflow_subject_customer could not derive the subject customer for a
-- `form_submission`, so account_owner / route_owner approvers never resolved
-- for forms. Instead of hard-coding form types, each form now DECLARES where
-- its subject customer comes from via `erp_form_definitions.subject_ref`:
--   {"entity":"customer","source":"record"}              → submission.record_id
--   {"entity":"customer","source":"field","key":"..."}   → a submitted field value
--   null                                                 → default = record_id
-- The resolver reads that declaration generically, so it works today and for
-- any future customer-related form (Trade Spend, Old Expiry, Credit, …).
-- Additive + idempotent.
-- ============================================================================

-- ── Declarative subject source on form definitions ─────────────────────────
alter table erp_form_definitions add column if not exists subject_ref jsonb;

-- ── FIX: generic subject-customer resolution for form submissions ──────────
create or replace function erp_workflow_subject_customer(p_entity text, p_record_id text)
returns uuid language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare v_cust uuid; v_sub erp_form_submissions; v_ref jsonb; v_cand text; v_src text;
begin
  if p_record_id is null then return null; end if;
  if p_entity = 'customer' then
    return p_record_id::uuid;
  elsif p_entity = 'credit_limit_request' then
    select customer_id into v_cust from erp_credit_limit_requests where id = p_record_id::uuid;
    return v_cust;
  elsif p_entity = 'form_submission' then
    select * into v_sub from erp_form_submissions where id = p_record_id::uuid;
    if v_sub.id is null then return null; end if;
    select subject_ref into v_ref from erp_form_definitions where id = v_sub.form_id;
    v_src := coalesce(v_ref->>'source', 'record');   -- null declaration ⇒ bound record
    if v_src = 'field' then
      v_cand := v_sub.values ->> coalesce(v_ref->>'key','');
    elsif v_src = 'record' then
      v_cand := v_sub.record_id;
    else
      v_cand := null;                                -- 'none' / unknown ⇒ no subject
    end if;
    if v_cand is null or v_cand !~ '^[0-9a-fA-F-]{36}$' then return null; end if;
    select id into v_cust from erp_customers where id = v_cand::uuid and company_id = v_sub.company_id;
    return v_cust;
  end if;
  return null;  -- platform / non-customer entities have no subject customer
end; $$;
revoke all on function erp_workflow_subject_customer(text,text) from public, anon, authenticated;

-- ── Process 1/2/3: global form templates (clone-to-use; company_id NULL) ────
insert into erp_form_definitions (company_id, key, name_ar, name_en, module, target_entity, workflow_key, effect, subject_ref, status, version, is_latest)
values
  (null,'fmcg_new_customer','طلب عميل جديد','New Customer Request','sales','customer','fmcg_new_customer_wf',
    '{"type":"create_customer","map":{"name":"customer_name","name_ar":"customer_name_ar","phone":"phone","email":"email","address":"address","city":"city","tax_number":"tax_number"}}'::jsonb,
    null,'active',1,true),
  (null,'fmcg_customer_update','تحديث بيانات عميل','Customer Data Update','sales','customer','fmcg_customer_update_wf',
    '{"type":"update_field","table":"erp_customers","column":"phone","value_from":"new_phone"}'::jsonb,
    '{"entity":"customer","source":"record"}'::jsonb,'active',1,true),
  (null,'fmcg_gps_correction','تصحيح موقع عميل','GPS Correction Request','distribution','customer','fmcg_gps_correction_wf',
    '{"type":"set_gps","table":"erp_customers","value_from":"location"}'::jsonb,
    '{"entity":"customer","source":"record"}'::jsonb,'active',1,true)
on conflict do nothing;

-- Fields — New Customer Request
insert into erp_form_fields (form_id, key, label_ar, label_en, type, sort_order, required)
select d.id, x.key, x.lar, x.len, x.typ, x.ord, x.req
  from erp_form_definitions d
  join (values
    ('customer_name','اسم العميل','Customer name','text',1,true),
    ('customer_name_ar','الاسم بالعربية','Name (Arabic)','text',2,false),
    ('phone','الهاتف','Phone','text',3,true),
    ('email','البريد الإلكتروني','Email','text',4,false),
    ('address','العنوان','Address','text',5,false),
    ('city','المدينة','City','text',6,false),
    ('tax_number','الرقم الضريبي','Tax number','text',7,false)
  ) as x(key,lar,len,typ,ord,req) on true
 where d.key='fmcg_new_customer' and d.company_id is null
on conflict (form_id, key) do nothing;

-- Fields — Customer Data Update
insert into erp_form_fields (form_id, key, label_ar, label_en, type, sort_order, required)
select d.id, x.key, x.lar, x.len, x.typ, x.ord, x.req
  from erp_form_definitions d
  join (values
    ('new_phone','الهاتف الجديد','New phone','text',1,true),
    ('reason','سبب التحديث','Reason','text',2,false)
  ) as x(key,lar,len,typ,ord,req) on true
 where d.key='fmcg_customer_update' and d.company_id is null
on conflict (form_id, key) do nothing;

-- Fields — GPS Correction Request
insert into erp_form_fields (form_id, key, label_ar, label_en, type, sort_order, required)
select d.id, x.key, x.lar, x.len, x.typ, x.ord, x.req
  from erp_form_definitions d
  join (values
    ('location','الموقع (خط العرض,خط الطول)','Location (lat,lng)','gps',1,true),
    ('note','ملاحظة','Note','text',2,false)
  ) as x(key,lar,len,typ,ord,req) on true
 where d.key='fmcg_gps_correction' and d.company_id is null
on conflict (form_id, key) do nothing;

-- ── Bound approval workflows (global, entity = form_submission) ─────────────
insert into erp_workflow_definitions (company_id, key, entity, name_ar, name_en, scope, category)
values
  (null,'fmcg_new_customer_wf','form_submission','اعتماد عميل جديد','New customer approval','company','forms'),
  (null,'fmcg_customer_update_wf','form_submission','اعتماد تحديث بيانات','Customer update approval','company','forms'),
  (null,'fmcg_gps_correction_wf','form_submission','اعتماد تصحيح الموقع','GPS correction approval','company','forms')
on conflict do nothing;

insert into erp_workflow_steps (definition_id, step_no, name_ar, name_en, approver_type, mode, required_approvals)
select id,1,'موافقة المدير','Admin approval','company_admin','sequential',1
  from erp_workflow_definitions where key='fmcg_new_customer_wf' and company_id is null
on conflict (definition_id, step_no) do nothing;

insert into erp_workflow_steps (definition_id, step_no, name_ar, name_en, approver_type, mode, required_approvals)
select id,1,'موافقة مالك الحساب','Account owner approval','account_owner','sequential',1
  from erp_workflow_definitions where key='fmcg_customer_update_wf' and company_id is null
on conflict (definition_id, step_no) do nothing;

insert into erp_workflow_steps (definition_id, step_no, name_ar, name_en, approver_type, mode, required_approvals)
select id,1,'موافقة مندوب الخط','Route owner approval','route_owner','sequential',1
  from erp_workflow_definitions where key='fmcg_gps_correction_wf' and company_id is null
on conflict (definition_id, step_no) do nothing;

-- ============================================================================
-- ROLLBACK (manual): delete the three fmcg_* form definitions (+ fields) and
-- fmcg_*_wf workflow definitions (+ steps); drop erp_form_definitions.subject_ref;
-- restore the 0107 body of erp_workflow_subject_customer.
-- ============================================================================
