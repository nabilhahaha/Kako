-- ============================================================================
-- 0035: Hotel / furnished-apartments module
-- ----------------------------------------------------------------------------
-- A first real "vertical" module beyond retail/distribution: rooms + bookings
-- (check-in / check-out), tenant-scoped like the rest of the ERP. Adds a
-- 'hotel.manage' permission, a 'housekeeping' role, the 'hotel' business type
-- and its role template. Additive, safe to re-run.
-- ============================================================================

-- ─── Rooms ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  code        TEXT NOT NULL,                 -- room number / unit code
  name        TEXT,                          -- e.g. "جناح بحري"
  room_type   TEXT,                          -- single / double / suite / apartment
  capacity    INTEGER NOT NULL DEFAULT 2,
  nightly_rate NUMERIC NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'available',  -- available / occupied / cleaning / maintenance
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

-- ─── Bookings ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  room_id       UUID NOT NULL REFERENCES erp_rooms(id) ON DELETE RESTRICT,
  customer_id   UUID REFERENCES erp_customers(id) ON DELETE SET NULL,
  guest_name    TEXT NOT NULL,
  guest_phone   TEXT,
  check_in      DATE NOT NULL,
  check_out     DATE NOT NULL,
  nights        INTEGER GENERATED ALWAYS AS (GREATEST((check_out - check_in), 1)) STORED,
  nightly_rate  NUMERIC NOT NULL DEFAULT 0,
  total_amount  NUMERIC NOT NULL DEFAULT 0,
  paid_amount   NUMERIC NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'reserved',  -- reserved / checked_in / checked_out / cancelled
  notes         TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);

CREATE INDEX IF NOT EXISTS idx_erp_rooms_company ON erp_rooms(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_bookings_company ON erp_bookings(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_bookings_room ON erp_bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_erp_bookings_dates ON erp_bookings(check_in, check_out);

-- ─── Tenant isolation + auto company_id (same pattern as the rest) ──────────
ALTER TABLE erp_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_bookings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS erp_rooms_set_company ON erp_rooms;
CREATE TRIGGER erp_rooms_set_company BEFORE INSERT ON erp_rooms
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_bookings_set_company ON erp_bookings;
CREATE TRIGGER erp_bookings_set_company BEFORE INSERT ON erp_bookings
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();

DROP POLICY IF EXISTS "erp_rooms_tenant" ON erp_rooms;
CREATE POLICY "erp_rooms_tenant" ON erp_rooms FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

DROP POLICY IF EXISTS "erp_bookings_tenant" ON erp_bookings;
CREATE POLICY "erp_bookings_tenant" ON erp_bookings FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- updated_at touch
DROP TRIGGER IF EXISTS erp_rooms_updated ON erp_rooms;
CREATE TRIGGER erp_rooms_updated BEFORE UPDATE ON erp_rooms
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
DROP TRIGGER IF EXISTS erp_bookings_updated ON erp_bookings;
CREATE TRIGGER erp_bookings_updated BEFORE UPDATE ON erp_bookings
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

-- ─── New role: housekeeping ─────────────────────────────────────────────────
INSERT INTO erp_roles (key, name_ar, is_system, rank) VALUES
  ('housekeeping', 'تدبير منزلي / نظافة', true, 1)
ON CONFLICT (key) DO NOTHING;

-- hotel.manage permission is granted to the front-desk / management roles.
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('admin','hotel.manage'),('manager','hotel.manage'),
  ('receptionist','hotel.manage'),('cashier','hotel.manage')
ON CONFLICT DO NOTHING;
-- housekeeping only needs to see/update room status; model that as hotel.manage
-- for now (UI can be narrowed later).
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('housekeeping','hotel.manage')
ON CONFLICT DO NOTHING;

-- ─── Hotel business type + template ─────────────────────────────────────────
INSERT INTO erp_business_type_roles (business_type, role_key) VALUES
  ('hotel','admin'),('hotel','manager'),('hotel','receptionist'),
  ('hotel','cashier'),('hotel','housekeeping'),('hotel','accountant'),('hotel','viewer')
ON CONFLICT (business_type, role_key) DO NOTHING;
