-- G6: add the "request" field-governance access level (read-only + can submit a
-- change request). Additive and backward-compatible: extends the CHECK enums on
-- erp_field_access.access and erp_field_config.default_access. No data backfill,
-- no behavior change for existing rows (which never use 'request').

ALTER TABLE erp_field_access  DROP CONSTRAINT IF EXISTS erp_field_access_access_check;
ALTER TABLE erp_field_access  ADD  CONSTRAINT erp_field_access_access_check
  CHECK (access IN ('hidden', 'view', 'request', 'edit', 'required'));

ALTER TABLE erp_field_config  DROP CONSTRAINT IF EXISTS erp_field_config_default_access_check;
ALTER TABLE erp_field_config  ADD  CONSTRAINT erp_field_config_default_access_check
  CHECK (default_access IN ('hidden', 'view', 'request', 'edit', 'required'));
