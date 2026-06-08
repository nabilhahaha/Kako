-- ============================================================================
-- 0230: Mobile Field App — offline sync queue + device audit (Phase 7B)
-- ----------------------------------------------------------------------------
-- The offline-first spine: every field mutation queued on-device lands here,
-- applied EXACTLY-ONCE (idempotency_key unique per company) with the conflict
-- policy enforced by src/lib/offline-sync. Plus a device-session audit trail
-- (app version / platform / last sync / GPS). Additive + INERT until KAKO_MOBILE
-- is on. Company-scoped RLS. Depends on 0005, 0018.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_offline_mutations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  device_id       text NOT NULL,
  user_id         uuid,
  idempotency_key uuid NOT NULL,
  entity          text NOT NULL,                  -- visit | order | collection | van_expense | ...
  entity_id       uuid,
  operation       text NOT NULL CHECK (operation IN ('create','update','delete')),
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  base_version    text,                            -- server version the edit was based on
  client_seq      bigint NOT NULL DEFAULT 0,       -- per-device causal order
  client_ts       timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','applied','conflict','rejected')),
  applied_at      timestamptz,
  conflict_reason text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)             -- exactly-once apply
);
CREATE INDEX IF NOT EXISTS idx_offline_mutations_company ON erp_offline_mutations (company_id, status);
CREATE INDEX IF NOT EXISTS idx_offline_mutations_device  ON erp_offline_mutations (device_id, client_seq);
ALTER TABLE erp_offline_mutations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_offline_mutations_tenant ON erp_offline_mutations;
CREATE POLICY erp_offline_mutations_tenant ON erp_offline_mutations FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Device session audit (one per company/device/user).
CREATE TABLE IF NOT EXISTS erp_device_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  user_id      uuid,
  device_id    text NOT NULL,
  app_version  text,
  platform     text,                               -- android | ios | web
  last_sync_at timestamptz,
  last_lat     numeric(9,6),
  last_lng     numeric(9,6),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, device_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_device_sessions_company ON erp_device_sessions (company_id, last_sync_at);
ALTER TABLE erp_device_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_device_sessions_tenant ON erp_device_sessions;
CREATE POLICY erp_device_sessions_tenant ON erp_device_sessions FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
