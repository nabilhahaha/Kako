-- 0074_clinic_reference.sql
-- A global clinical reference list (drugs, lab tests, radiology) powering the
-- doctor's prescription/tests autocomplete. Shared across all tenants; readable
-- by any signed-in user, writable only by the platform owner (the drug list is
-- loaded/refreshed from the open Egyptian Drug Database via an importer).

create extension if not exists pg_trgm with schema extensions;

create table if not exists erp_clinic_reference (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('drug', 'lab', 'radiology')),
  name       text not null,
  name_ar    text,
  detail     text,
  price      numeric,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Fast fuzzy/substring search on the searchable columns.
create index if not exists idx_clinic_ref_name_trgm on erp_clinic_reference using gin (name gin_trgm_ops);
create index if not exists idx_clinic_ref_name_ar_trgm on erp_clinic_reference using gin (name_ar gin_trgm_ops);
create index if not exists idx_clinic_ref_detail_trgm on erp_clinic_reference using gin (detail gin_trgm_ops);
create index if not exists idx_clinic_ref_kind on erp_clinic_reference (kind);

alter table erp_clinic_reference enable row level security;

create policy erp_clinic_reference_read on erp_clinic_reference
  for select using ((select auth.uid()) is not null);
create policy erp_clinic_reference_ins on erp_clinic_reference
  for insert with check ((select erp_is_platform_owner()));
create policy erp_clinic_reference_upd on erp_clinic_reference
  for update using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));
create policy erp_clinic_reference_del on erp_clinic_reference
  for delete using ((select erp_is_platform_owner()));

-- ── Seed: common lab tests ─────────────────────────────────────────────────
insert into erp_clinic_reference (kind, name, detail) values
  ('lab','صورة دم كاملة','CBC Complete Blood Count'),
  ('lab','سكر صائم','FBS Fasting Blood Sugar'),
  ('lab','سكر فاطر','PPBS Post Prandial'),
  ('lab','سكر عشوائي','RBS Random Blood Sugar'),
  ('lab','سكر تراكمي','HbA1c'),
  ('lab','وظائف كبد','LFT ALT AST Liver Function'),
  ('lab','وظائف كلى','KFT Urea Creatinine'),
  ('lab','صورة دهون','Lipid Profile Cholesterol Triglycerides'),
  ('lab','وظائف الغدة الدرقية','TSH T3 T4 Thyroid'),
  ('lab','سرعة ترسيب','ESR'),
  ('lab','بروتين سي التفاعلي','CRP'),
  ('lab','تحليل بول كامل','Urine Analysis'),
  ('lab','تحليل براز','Stool Analysis'),
  ('lab','مزرعة بول','Urine Culture'),
  ('lab','أملاح (صوديوم وبوتاسيوم)','Electrolytes Na K'),
  ('lab','كالسيوم','Calcium'),
  ('lab','ماغنيسيوم','Magnesium'),
  ('lab','فوسفور','Phosphorus'),
  ('lab','حمض اليوريك','Uric Acid'),
  ('lab','فيتامين د','Vitamin D 25-OH'),
  ('lab','فيتامين ب12','Vitamin B12'),
  ('lab','حديد','Serum Iron'),
  ('lab','فيريتين','Ferritin'),
  ('lab','زمن البروثرومبين','PT INR'),
  ('lab','زمن التجلط','PTT'),
  ('lab','فصيلة الدم','Blood Group ABO Rh'),
  ('lab','هرمون الحمل','Beta HCG'),
  ('lab','هرمون جار الدرقية','PTH'),
  ('lab','إنزيمات القلب','Troponin CK-MB'),
  ('lab','تحليل سائل منوي','Semen Analysis'),
  ('lab','مزرعة دم','Blood Culture'),
  ('lab','بيليروبين','Bilirubin'),
  ('lab','ألبومين','Albumin'),
  ('lab','بروتين كلي','Total Protein'),
  ('lab','هرمون الذكورة','Testosterone'),
  ('lab','هرمونات أنثوية','FSH LH Estradiol Prolactin'),
  ('lab','أميليز / ليبيز','Amylase Lipase Pancreas'),
  ('lab','دلالات أورام','Tumor Markers CEA CA125 PSA'),
  ('lab','فيروس سي','HCV Ab'),
  ('lab','فيروس بي','HBsAg'),
  ('lab','تحليل HIV','HIV'),
  ('lab','مزرعة حلق','Throat Culture');

-- ── Seed: common radiology / imaging ───────────────────────────────────────
insert into erp_clinic_reference (kind, name, detail) values
  ('radiology','أشعة صدر','Chest X-Ray'),
  ('radiology','أشعة بطن','Abdominal X-Ray'),
  ('radiology','سونار بطن وحوض','Abdominal Pelvic Ultrasound'),
  ('radiology','سونار حمل','Obstetric Ultrasound'),
  ('radiology','سونار غدة درقية','Thyroid Ultrasound'),
  ('radiology','إيكو على القلب','Echocardiography'),
  ('radiology','رسم قلب','ECG EKG'),
  ('radiology','رسم قلب بالمجهود','Stress ECG'),
  ('radiology','أشعة مقطعية على المخ','CT Brain'),
  ('radiology','أشعة مقطعية على البطن','CT Abdomen'),
  ('radiology','أشعة مقطعية على الصدر','CT Chest'),
  ('radiology','رنين مغناطيسي على المخ','MRI Brain'),
  ('radiology','رنين على العمود الفقري','MRI Spine'),
  ('radiology','رنين على الركبة','MRI Knee'),
  ('radiology','أشعة على العمود الفقري','Spine X-Ray'),
  ('radiology','أشعة على الركبة','Knee X-Ray'),
  ('radiology','أشعة على اليد','Hand X-Ray'),
  ('radiology','أشعة بالصبغة على الكلى','IVP'),
  ('radiology','ماموجرام (ثدي)','Mammography'),
  ('radiology','دوبلر على الشرايين','Arterial Doppler'),
  ('radiology','دوبلر على الأوردة','Venous Doppler'),
  ('radiology','أشعة أسنان بانوراما','Dental Panorama OPG'),
  ('radiology','قياس كثافة العظام','DEXA Bone Density'),
  ('radiology','منظار جهاز هضمي','Endoscopy'),
  ('radiology','مسح ذري على العظام','Bone Scan');
