-- Trade spend customers (derived from raw data uploads)
CREATE TABLE IF NOT EXISTS ts_customers (
  account TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  class TEXT,
  channel TEXT,
  classification TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trade spend items (derived from raw data)
CREATE TABLE IF NOT EXISTS ts_items (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

-- Sales transactions (the raw data)
CREATE TABLE IF NOT EXISTS ts_sales_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account TEXT NOT NULL REFERENCES ts_customers(account) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES ts_items(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  value_ex_vat NUMERIC NOT NULL DEFAULT 0,
  cases NUMERIC NOT NULL DEFAULT 0
);

-- Indexes for fast range queries
CREATE INDEX IF NOT EXISTS idx_ts_sales_account ON ts_sales_transactions(account);
CREATE INDEX IF NOT EXISTS idx_ts_sales_item ON ts_sales_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_ts_sales_date ON ts_sales_transactions(date);
CREATE INDEX IF NOT EXISTS idx_ts_sales_account_item_date ON ts_sales_transactions(account, item_id, date);

-- Spend types (editable list)
CREATE TABLE IF NOT EXISTS ts_spend_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default spend types
INSERT INTO ts_spend_types (name) VALUES ('Gandola'), ('Floor Display')
ON CONFLICT (name) DO NOTHING;

-- Trade spend users
CREATE TABLE IF NOT EXISTS ts_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  roles TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Campaigns (the heart of the system)
CREATE TABLE IF NOT EXISTS ts_campaigns (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL REFERENCES ts_customers(account) ON DELETE CASCADE,
  classification TEXT,
  spend_type TEXT NOT NULL,
  duration_key TEXT NOT NULL DEFAULT 'none',
  duration_months INTEGER,
  item_ids TEXT[] NOT NULL DEFAULT '{}',
  spend_amount NUMERIC NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  roshen_pct NUMERIC NOT NULL DEFAULT 50,
  period_mode TEXT NOT NULL DEFAULT 'match',
  custom_days INTEGER,
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
  approved_roshen_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ts_campaigns_account ON ts_campaigns(account);
CREATE INDEX IF NOT EXISTS idx_ts_campaigns_status ON ts_campaigns(status);

-- Campaign branches (one per targeted branch)
CREATE TABLE IF NOT EXISTS ts_campaign_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL REFERENCES ts_campaigns(id) ON DELETE CASCADE,
  branch_name TEXT NOT NULL DEFAULT '',
  photo_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_ts_branches_campaign ON ts_campaign_branches(campaign_id);

-- Workflow events (audit trail)
CREATE TABLE IF NOT EXISTS ts_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL REFERENCES ts_campaigns(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES ts_users(id),
  action TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ts_workflow_campaign ON ts_workflow_events(campaign_id);

-- Saved column mappings (for dynamic data import)
CREATE TABLE IF NOT EXISTS ts_column_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  mapping JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE ts_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_sales_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_spend_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_campaign_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ts_column_mappings ENABLE ROW LEVEL SECURITY;

-- For Phase 1/2, allow all authenticated users full access
-- (proper RLS policies will be added in Phase 4)
CREATE POLICY "ts_customers_all" ON ts_customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_items_all" ON ts_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_sales_transactions_all" ON ts_sales_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_spend_types_all" ON ts_spend_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_users_all" ON ts_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_campaigns_all" ON ts_campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_campaign_branches_all" ON ts_campaign_branches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_workflow_events_all" ON ts_workflow_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ts_column_mappings_all" ON ts_column_mappings FOR ALL USING (true) WITH CHECK (true);
