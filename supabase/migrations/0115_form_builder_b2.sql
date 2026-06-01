-- ============================================================================
-- 0115: Form & Workflow Builder — B2 support (help text + forms permission)
-- ----------------------------------------------------------------------------
-- Additive support for the Form Designer UI: per-field help text, and a `forms`
-- resource in the Permission Matrix (so the builder can be matrix-gated).
-- ============================================================================

-- Per-field help text (Labels and Help Text)
alter table erp_form_fields add column if not exists help_ar text;
alter table erp_form_fields add column if not exists help_en text;

-- `forms` resource in the permission catalog (build/manage forms)
insert into erp_permission_catalog (key, resource, action, module, name_ar, name_en) values
  ('forms:view',  'forms','view',  'workflow','النماذج — عرض','Forms — View'),
  ('forms:create','forms','create','workflow','النماذج — إنشاء','Forms — Create'),
  ('forms:edit',  'forms','edit',  'workflow','النماذج — تعديل','Forms — Edit'),
  ('forms:delete','forms','delete','workflow','النماذج — حذف','Forms — Delete')
on conflict (key) do nothing;

-- Grant to built-in roles (additive global defaults)
insert into erp_matrix_role_permissions (company_id, role_key, permission)
  select null, 'admin', key from erp_permission_catalog where resource='forms' on conflict do nothing;
insert into erp_matrix_role_permissions (company_id, role_key, permission) values
  (null,'manager','forms:view'),(null,'manager','forms:create'),(null,'manager','forms:edit')
on conflict do nothing;

-- ============================================================================
-- ROLLBACK (manual): delete the forms catalog/grant rows; drop help_ar/help_en.
-- ============================================================================
