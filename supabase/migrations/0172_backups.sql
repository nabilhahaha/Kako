-- ============================================================================
-- 0172: Scheduled / automatic backups (+ retention) and snapshot storage
-- ----------------------------------------------------------------------------
-- A per-company backup store, manual "Backup Now", and a daily pg_cron job that
-- snapshots companies on a daily/weekly schedule, with retention pruning. The
-- snapshot is the company's OWN data only (RLS-irrelevant SECURITY DEFINER funcs
-- filter by company_id). Additive; reuses erp_ops_settings + erp_log_audit().
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_backups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual','scheduled')),
  record_counts JSONB,
  payload       JSONB,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_backups_company ON erp_backups(company_id, created_at DESC);

ALTER TABLE erp_backups ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_backups_set_company ON erp_backups;
CREATE TRIGGER erp_backups_set_company BEFORE INSERT ON erp_backups FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP POLICY IF EXISTS "erp_backups_tenant" ON erp_backups;
CREATE POLICY "erp_backups_tenant" ON erp_backups FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Schedule / retention settings on the per-company ops settings.
ALTER TABLE erp_ops_settings
  ADD COLUMN IF NOT EXISTS backup_frequency TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS backup_retention INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS last_backup_at   TIMESTAMPTZ;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='erp_ops_settings_backup_freq_chk') THEN
    ALTER TABLE erp_ops_settings ADD CONSTRAINT erp_ops_settings_backup_freq_chk CHECK (backup_frequency IN ('off','daily','weekly'));
  END IF;
END $$;

-- ── Snapshot a company's own data into one jsonb document ────────────────────
CREATE OR REPLACE FUNCTION erp_snapshot_company(p_co UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'meta', jsonb_build_object('exported_at', now(), 'company_id', p_co, 'version', 1),
    'company',  (SELECT to_jsonb(c) FROM erp_companies c WHERE c.id = p_co),
    'products', (SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM erp_products_catalog p WHERE p.company_id = p_co),
    'customers',(SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM erp_customers c WHERE c.company_id = p_co),
    'suppliers',(SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM erp_suppliers s WHERE s.company_id = p_co),
    'invoices', (SELECT COALESCE(jsonb_agg(to_jsonb(i)), '[]'::jsonb) FROM erp_invoices i WHERE i.branch_id IN (SELECT id FROM erp_branches WHERE company_id = p_co)),
    'invoice_lines', (SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb) FROM erp_invoice_lines l WHERE l.invoice_id IN (SELECT id FROM erp_invoices WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = p_co))),
    'installment_plans', (SELECT COALESCE(jsonb_agg(to_jsonb(ip)), '[]'::jsonb) FROM erp_installment_plans ip WHERE ip.company_id = p_co),
    'installment_schedule', (SELECT COALESCE(jsonb_agg(to_jsonb(sc)), '[]'::jsonb) FROM erp_installment_schedule sc WHERE sc.company_id = p_co),
    'sales_returns', (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM erp_sales_returns r WHERE r.branch_id IN (SELECT id FROM erp_branches WHERE company_id = p_co)),
    'expenses', (SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM erp_expenses e WHERE e.company_id = p_co)
  );
$$;
REVOKE ALL ON FUNCTION erp_snapshot_company(UUID) FROM public;
GRANT EXECUTE ON FUNCTION erp_snapshot_company(UUID) TO authenticated, service_role;

-- ── Create a backup (manual or scheduled) + retention prune ──────────────────
CREATE OR REPLACE FUNCTION erp_create_backup(p_kind TEXT DEFAULT 'manual', p_company_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co UUID := COALESCE(p_company_id, erp_user_company_id());
  v_uid UUID := auth.uid();
  v_payload JSONB;
  v_counts JSONB;
  v_keep INT;
  v_id UUID;
BEGIN
  IF v_co IS NULL THEN RAISE EXCEPTION 'لا توجد شركة مرتبطة.'; END IF;
  v_payload := erp_snapshot_company(v_co);
  v_counts := jsonb_build_object(
    'products', jsonb_array_length(v_payload->'products'),
    'customers', jsonb_array_length(v_payload->'customers'),
    'suppliers', jsonb_array_length(v_payload->'suppliers'),
    'invoices', jsonb_array_length(v_payload->'invoices')
  );
  INSERT INTO erp_backups (company_id, kind, record_counts, payload, created_by)
  VALUES (v_co, CASE WHEN p_kind='scheduled' THEN 'scheduled' ELSE 'manual' END, v_counts, v_payload, v_uid)
  RETURNING id INTO v_id;

  INSERT INTO erp_ops_settings (company_id, last_backup_at) VALUES (v_co, now())
  ON CONFLICT (company_id) DO UPDATE SET last_backup_at = now();

  -- Retention: keep the newest N backups for the company.
  SELECT GREATEST(COALESCE(backup_retention, 7), 1) INTO v_keep FROM erp_ops_settings WHERE company_id = v_co;
  DELETE FROM erp_backups b WHERE b.company_id = v_co AND b.id NOT IN (
    SELECT id FROM erp_backups WHERE company_id = v_co ORDER BY created_at DESC LIMIT COALESCE(v_keep, 7)
  );

  PERFORM erp_log_audit('backup.created', 'erp_backups', v_id::text, jsonb_build_object('kind', p_kind, 'counts', v_counts), v_co);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION erp_create_backup(TEXT, UUID) FROM public;
GRANT EXECUTE ON FUNCTION erp_create_backup(TEXT, UUID) TO authenticated, service_role;

-- ── Scheduled runner (called by pg_cron) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_run_scheduled_backups()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c RECORD; n INT := 0;
BEGIN
  FOR c IN
    SELECT company_id FROM erp_ops_settings
    WHERE backup_frequency = 'daily'
       OR (backup_frequency = 'weekly' AND extract(dow FROM now()) = 0)  -- Sundays
  LOOP
    PERFORM erp_create_backup('scheduled', c.company_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION erp_run_scheduled_backups() FROM public;
GRANT EXECUTE ON FUNCTION erp_run_scheduled_backups() TO service_role;

-- ── Register the daily cron (idempotent) ─────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'erp-daily-backups') THEN
      PERFORM cron.unschedule('erp-daily-backups');
    END IF;
    PERFORM cron.schedule('erp-daily-backups', '0 2 * * *', 'SELECT erp_run_scheduled_backups();');
  END IF;
END $$;
