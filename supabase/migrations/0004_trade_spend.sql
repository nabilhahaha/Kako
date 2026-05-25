-- ============================================================================
-- Trade Spend Platform — Multi-Distributor Schema
-- ============================================================================

-- Distributors (top-level entity)
CREATE TABLE IF NOT EXISTS ts_distributors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO ts_distributors (id, name, code) VALUES
  ('dist-relaia', 'Relaia', 'REL'),
  ('dist-tofola', 'Tofola', 'TOF'),
  ('dist-gulf', 'Gulf Food Supply', 'GFS'),
  ('dist-tala', 'Tala', 'TAL')
ON CONFLICT (id) DO NOTHING;

-- Trade spend users (scoped per distributor)
CREATE TABLE IF NOT EXISTS ts_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id TEXT NOT NULL REFERENCES ts_distributors(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  roles TEXT[] NOT NULL DEFAULT '{}',
  password TEXT NOT NULL DEFAULT 'Roshen2026',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(distributor_id, email)
);

-- Trade spend customers (scoped per distributor)
CREATE TABLE IF NOT EXISTS ts_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id TEXT NOT NULL REFERENCES ts_distributors(id) ON DELETE CASCADE,
  account TEXT NOT NULL,
  name TEXT NOT NULL,
  class TEXT,
  channel TEXT,
  classification TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(distributor_id, account)
);

CREATE INDEX IF NOT EXISTS idx_ts_customers_dist ON ts_customers(distributor_id);

-- Trade spend items (scoped per distributor)
CREATE TABLE IF NOT EXISTS ts_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id TEXT NOT NULL REFERENCES ts_distributors(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  description TEXT NOT NULL,
  UNIQUE(distributor_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_ts_items_dist ON ts_items(distributor_id);

-- Sales transactions (scoped per distributor)
CREATE TABLE IF NOT EXISTS ts_sales_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id TEXT NOT NULL REFERENCES ts_distributors(id) ON DELETE CASCADE,
  account TEXT NOT NULL,
  item_id TEXT NOT NULL,
  date DATE NOT NULL,
  value_ex_vat NUMERIC NOT NULL DEFAULT 0,
  cases NUMERIC NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ts_sales_dist ON ts_sales_transactions(distributor_id);
CREATE INDEX IF NOT EXISTS idx_ts_sales_account ON ts_sales_transactions(account);
CREATE INDEX IF NOT EXISTS idx_ts_sales_date ON ts_sales_transactions(date);
CREATE INDEX IF NOT EXISTS idx_ts_sales_dist_account_date ON ts_sales_transactions(distributor_id, account, item_id, date);

-- Spend types (scoped per distributor)
CREATE TABLE IF NOT EXISTS ts_spend_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id TEXT NOT NULL REFERENCES ts_distributors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(distributor_id, name)
);

-- Campaigns (scoped per distributor)
CREATE TABLE IF NOT EXISTS ts_campaigns (
  id TEXT NOT NULL,
  distributor_id TEXT NOT NULL REFERENCES ts_distributors(id) ON DELETE CASCADE,
  account TEXT NOT NULL,
  classification TEXT,
  spend_type TEXT NOT NULL,
  duration_key TEXT NOT NULL DEFAULT 'none',
  duration_months INTEGER,
  item_ids TEXT[] NOT NULL DEFAULT '{}',
  spend_amount NUMERIC NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  roshen_pct NUMERIC NOT NULL DEFAULT 50,
  period_mode TEXT NOT NULL DEFAULT 'days',
  custom_days INTEGER DEFAULT 30,
  before_start DATE,
  before_end DATE,
  after_start DATE,
  after_end DATE,
  branch_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES ts_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  approved_distributor_at TIMESTAMPTZ,
  approved_roshen_at TIMESTAMPTZ,
  photos_submitted_at TIMESTAMPTZ,
  final_approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  PRIMARY KEY (distributor_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ts_campaigns_dist ON ts_campaigns(distributor_id);
CREATE INDEX IF NOT EXISTS idx_ts_campaigns_status ON ts_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_ts_campaigns_account ON ts_campaigns(account);

-- Campaign branches
CREATE TABLE IF NOT EXISTS ts_campaign_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id TEXT NOT NULL REFERENCES ts_distributors(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  branch_name TEXT NOT NULL DEFAULT '',
  photo_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_ts_branches_campaign ON ts_campaign_branches(campaign_id);

-- Workflow events (audit trail)
CREATE TABLE IF NOT EXISTS ts_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id TEXT NOT NULL REFERENCES ts_distributors(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  actor_user_id UUID REFERENCES ts_users(id),
  action TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ts_workflow_dist ON ts_workflow_events(distributor_id);
CREATE INDEX IF NOT EXISTS idx_ts_workflow_campaign ON ts_workflow_events(campaign_id);

-- Saved column mappings (scoped per distributor)
CREATE TABLE IF NOT EXISTS ts_column_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id TEXT NOT NULL REFERENCES ts_distributors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mapping JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(distributor_id, name)
);

-- Notifications (scoped per distributor)
CREATE TABLE IF NOT EXISTS ts_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id TEXT NOT NULL REFERENCES ts_distributors(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  campaign_id TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ts_notifications_dist ON ts_notifications(distributor_id);
CREATE INDEX IF NOT EXISTS idx_ts_notifications_read ON ts_notifications(read);

-- Enable Row Level Security
ALTER TABLE ts_distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_sales_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_spend_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_campaign_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_column_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_notifications ENABLE ROW LEVEL SECURITY;

-- Permissive policies (Phase 4 will add proper RLS)
CREATE POLICY "ts_all_distributors" ON ts_distributors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_all_users" ON ts_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_all_customers" ON ts_customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_all_items" ON ts_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_all_transactions" ON ts_sales_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_all_spend_types" ON ts_spend_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_all_campaigns" ON ts_campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_all_branches" ON ts_campaign_branches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_all_workflow" ON ts_workflow_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_all_mappings" ON ts_column_mappings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_all_notifications" ON ts_notifications FOR ALL USING (true) WITH CHECK (true);
