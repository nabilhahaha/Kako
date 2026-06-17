-- 0315 — Backend-Enforcement Phase F: new `product.edit` permission.
--
-- Introduces a dedicated product.edit capability (separate from product.create),
-- establishing the view/create/edit/delete/approve product model. Granted to the
-- superuser roles (admin, manager) in the GLOBAL template so legacy/new tenants
-- are consistent. Per-company grants (e.g. the pilot) are applied as scoped data
-- steps, not here, to avoid touching other tenants' configs. Additive + idempotent.

insert into erp_role_permissions (role_key, permission)
values ('admin', 'product.edit'), ('manager', 'product.edit')
on conflict (role_key, permission) do nothing;
