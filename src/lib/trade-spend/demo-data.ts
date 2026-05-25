import type {
  TradeSpendCustomer,
  TradeSpendItem,
  SalesTransaction,
  SpendType,
  TradeSpendUser,
  Campaign,
} from './types';

// ---------------------------------------------------------------------------
// Seeded pseudo-random number generator (deterministic, no Math.random)
// ---------------------------------------------------------------------------
function seededRandom(seed: number): number {
  return ((seed * 9301 + 49297) % 233280) / 233280;
}

// ---------------------------------------------------------------------------
// DEMO_CUSTOMERS  (~20 Saudi Arabian customers)
// ---------------------------------------------------------------------------
export const DEMO_CUSTOMERS: TradeSpendCustomer[] = [
  { account: '10-024446', name: 'Al Othaim Markets', class: 'SSS 30 Days', channel: 'MODERN', classification: 'wholesale', created_at: '2026-01-01' },
  { account: '10-024501', name: 'Panda Retail Company', class: 'SSS 30 Days', channel: 'MODERN', classification: 'wholesale', created_at: '2026-01-01' },
  { account: '10-024512', name: 'BinDawood Holding', class: 'AA 60 Days', channel: 'MODERN', classification: 'wholesale', created_at: '2026-01-01' },
  { account: '10-024523', name: 'Danube Company', class: 'SSS 30 Days', channel: 'MODERN', classification: 'wholesale', created_at: '2026-01-01' },
  { account: '10-024534', name: 'Tamimi Markets', class: 'AA 60 Days', channel: 'MODERN', classification: 'wholesale', created_at: '2026-01-01' },
  { account: '10-024545', name: 'Farm Superstores', class: 'A 90 Days', channel: 'MODERN', classification: 'wholesale', created_at: '2026-01-01' },
  { account: '10-024556', name: 'Carrefour Saudi', class: 'SSS 30 Days', channel: 'MODERN', classification: 'wholesale', created_at: '2026-01-01' },
  { account: '10-024567', name: 'Lulu Hypermarket', class: 'AA 60 Days', channel: 'MODERN', classification: 'wholesale', created_at: '2026-01-01' },
  { account: '10-024578', name: 'Al Raya Supermarket', class: 'A 90 Days', channel: 'MODERN', classification: 'grocery', created_at: '2026-01-01' },
  { account: '10-024589', name: 'Nesto Hypermarket', class: 'B 120 Days', channel: 'MODERN', classification: 'grocery', created_at: '2026-01-01' },
  { account: '20-031001', name: 'Al Sadhan Trading', class: 'AA 60 Days', channel: 'TRADITIONAL', classification: 'wholesale', created_at: '2026-01-01' },
  { account: '20-031012', name: 'Sultan Wholesale', class: 'A 90 Days', channel: 'TRADITIONAL', classification: 'wholesale', created_at: '2026-01-01' },
  { account: '20-031023', name: 'Al Jazira Supermarket', class: 'B 120 Days', channel: 'TRADITIONAL', classification: 'grocery', created_at: '2026-01-01' },
  { account: '20-031034', name: 'Sasco Discount Store', class: 'A 90 Days', channel: 'TRADITIONAL', classification: 'discounter', created_at: '2026-01-01' },
  { account: '20-031045', name: 'Al Dahiya Discounter', class: 'B 120 Days', channel: 'TRADITIONAL', classification: 'discounter', created_at: '2026-01-01' },
  { account: '20-031056', name: 'Kuwaiti Roastery', class: 'A 90 Days', channel: 'TRADITIONAL', classification: 'roastery', created_at: '2026-01-01' },
  { account: '20-031067', name: 'Al Qasr Roastery', class: 'B 120 Days', channel: 'TRADITIONAL', classification: 'roastery', created_at: '2026-01-01' },
  { account: '20-031078', name: 'Saadeddin Pastry', class: 'SSS 30 Days', channel: 'TRADITIONAL', classification: 'sweets', created_at: '2026-01-01' },
  { account: '20-031089', name: 'Al Mubarak Sweets', class: 'AA 60 Days', channel: 'TRADITIONAL', classification: 'sweets', created_at: '2026-01-01' },
  { account: '30-040001', name: 'Noon Daily', class: 'SSS 30 Days', channel: 'E-commerce', classification: 'wholesale', created_at: '2026-01-01' },
];

// ---------------------------------------------------------------------------
// DEMO_ITEMS  (~15 Roshen confectionery products)
// ---------------------------------------------------------------------------
export const DEMO_ITEMS: TradeSpendItem[] = [
  { id: 'ROS21635', description: 'Roshen Assortment Chocolate Box 154g' },
  { id: 'ROS21640', description: 'Roshen Konafah Chocolate Bar 40g' },
  { id: 'ROS21645', description: 'Roshen Wafers Artec 130g' },
  { id: 'ROS21650', description: 'Roshen Candy Caramel 200g' },
  { id: 'ROS21655', description: 'Roshen Dark Chocolate 85% 90g' },
  { id: 'ROS21660', description: 'Roshen Milky Splash Toffee 150g' },
  { id: 'ROS21665', description: 'Roshen Chocolate Pralines 144g' },
  { id: 'ROS21670', description: 'Roshen Wafers Sandwich Cocoa 72g' },
  { id: 'ROS21675', description: 'Roshen Jelly Candy Mix 200g' },
  { id: 'ROS21680', description: 'Roshen Milk Chocolate Bar 100g' },
  { id: 'ROS21685', description: 'Roshen Hazelnut Chocolate 90g' },
  { id: 'ROS21690', description: 'Roshen BonBons Soft Caramel 150g' },
  { id: 'ROS21695', description: 'Roshen KoKo Choco White 40g' },
  { id: 'ROS21700', description: 'Roshen Assortment Elegant 340g' },
  { id: 'ROS21705', description: 'Roshen Crispy Wafer Rolls 100g' },
];

// ---------------------------------------------------------------------------
// DEMO_TRANSACTIONS  (~500 deterministic sales transactions)
// ---------------------------------------------------------------------------
function generateTransactions(): SalesTransaction[] {
  const transactions: SalesTransaction[] = [];
  let globalSeed = 1;
  let txId = 1;

  // Date range: 2026-04-01 to 2026-05-08 (38 days)
  const startEpoch = Date.UTC(2026, 3, 1); // April 1 2026
  const totalDays = 38;

  for (let ci = 0; ci < DEMO_CUSTOMERS.length; ci++) {
    const customer = DEMO_CUSTOMERS[ci];
    // Each customer gets 15-40 transactions based on seed
    const r0 = seededRandom(globalSeed++);
    const txCount = 15 + Math.floor(r0 * 26); // 15..40

    for (let ti = 0; ti < txCount; ti++) {
      // Pick a random day within the range
      const r1 = seededRandom(globalSeed++);
      const dayOffset = Math.floor(r1 * totalDays);
      const txDate = new Date(startEpoch + dayOffset * 86_400_000);
      const dateStr = txDate.toISOString().slice(0, 10);

      // Pick a random item
      const r2 = seededRandom(globalSeed++);
      const itemIdx = Math.floor(r2 * DEMO_ITEMS.length);
      const item = DEMO_ITEMS[itemIdx];

      // Determine if this is a return (~5% of rows)
      const r3 = seededRandom(globalSeed++);
      const isReturn = r3 < 0.05;

      // Value ex VAT: 50 - 5000 SAR (returns are negative)
      const r4 = seededRandom(globalSeed++);
      const rawValue = 50 + Math.floor(r4 * 4951); // 50..5000
      const value_ex_vat = isReturn ? -rawValue : rawValue;

      // Cases: 1-50 (returns are negative)
      const r5 = seededRandom(globalSeed++);
      const rawCases = 1 + Math.floor(r5 * 50); // 1..50
      const cases = isReturn ? -rawCases : rawCases;

      transactions.push({
        id: `TXN-${String(txId).padStart(6, '0')}`,
        account: customer.account,
        item_id: item.id,
        date: dateStr,
        value_ex_vat: Math.round(value_ex_vat * 100) / 100,
        cases,
      });

      txId++;
    }
  }

  return transactions;
}

export const DEMO_TRANSACTIONS: SalesTransaction[] = generateTransactions();

// ---------------------------------------------------------------------------
// DEMO_SPEND_TYPES
// ---------------------------------------------------------------------------
export const DEMO_SPEND_TYPES: SpendType[] = [
  { id: 'st-001', name: 'Gandola' },
  { id: 'st-002', name: 'Floor Display' },
];

// ---------------------------------------------------------------------------
// DEMO_USERS  (one per role + one combined admin)
// ---------------------------------------------------------------------------
export const DEMO_USERS: TradeSpendUser[] = [
  { id: 'demo-mgr-1', email: 'manager1@demo.com', display_name: 'Ahmad Al-Salem', roles: ['dept_manager'], active: true, password: 'Roshen2026', created_at: '2026-01-01' },
  { id: 'demo-mgr-2', email: 'manager2@demo.com', display_name: 'Khalid Al-Rashidi', roles: ['dept_manager'], active: true, password: 'Roshen2026', created_at: '2026-01-01' },
  { id: 'demo-dist', email: 'trade@demo.com', display_name: 'Sarah Al-Mutairi', roles: ['distributor_trade_mktg'], active: true, password: 'Roshen2026', created_at: '2026-01-01' },
  { id: 'demo-roshen', email: 'roshen@demo.com', display_name: 'Olena Kovalenko', roles: ['roshen_approver'], active: true, password: 'Roshen2026', created_at: '2026-01-01' },
  { id: 'demo-viewer', email: 'viewer@demo.com', display_name: 'Mohammed Al-Harbi', roles: ['viewer'], active: true, password: 'Roshen2026', created_at: '2026-01-01' },
  { id: 'demo-admin', email: 'admin@demo.com', display_name: 'Nabil Ismailia', roles: ['admin', 'roshen_approver'], active: true, password: 'Roshen2026', created_at: '2026-01-01' },
];

// ---------------------------------------------------------------------------
// DEMO_CAMPAIGNS  (3-4 sample campaigns in various statuses)
// ---------------------------------------------------------------------------
export const DEMO_CAMPAIGNS: Campaign[] = [
  // 1. Approved Gandola campaign — 1 month, 2 items, 5000 SAR, 50% Roshen, match period
  {
    id: 'TS-000001',
    account: '10-024446', // Al Othaim Markets
    classification: 'wholesale',
    spend_type: 'st-001', // Gandola
    duration_key: '1m',
    duration_months: 1,
    item_ids: ['ROS21635', 'ROS21640'],
    spend_amount: 5000,
    start_date: '2026-04-01',
    roshen_pct: 50,
    period_mode: 'match',
    before_start: '2026-03-01',
    before_end: '2026-03-31',
    after_start: '2026-04-01',
    after_end: '2026-04-30',
    branch_count: 3,
    branches: [
      { id: 'br-001', campaign_id: 'TS-000001', branch_name: 'Al Othaim - Riyadh Main' },
      { id: 'br-002', campaign_id: 'TS-000001', branch_name: 'Al Othaim - Jeddah Center' },
      { id: 'br-003', campaign_id: 'TS-000001', branch_name: 'Al Othaim - Dammam Mall' },
    ],
    status: 'approved',
    created_by: 'demo-mgr-1',
    created_at: '2026-03-15',
    submitted_at: '2026-03-16',
    approved_distributor_at: '2026-03-18',
    approved_roshen_at: '2026-03-20',
  },

  // 2. Pending distributor — Floor Display, 3 months, 3 items, 12000 SAR, 60% Roshen
  {
    id: 'TS-000002',
    account: '10-024501', // Panda Retail Company
    classification: 'wholesale',
    spend_type: 'st-002', // Floor Display
    duration_key: '3m',
    duration_months: 3,
    item_ids: ['ROS21650', 'ROS21665', 'ROS21680'],
    spend_amount: 12000,
    start_date: '2026-05-01',
    roshen_pct: 60,
    period_mode: 'days',
    custom_days: 30,
    before_start: '2026-04-01',
    before_end: '2026-04-30',
    after_start: '2026-05-01',
    after_end: '2026-07-31',
    branch_count: 5,
    branches: [
      { id: 'br-004', campaign_id: 'TS-000002', branch_name: 'Panda - King Fahd Road' },
      { id: 'br-005', campaign_id: 'TS-000002', branch_name: 'Panda - Tahlia Street' },
      { id: 'br-006', campaign_id: 'TS-000002', branch_name: 'Panda - Olaya District' },
      { id: 'br-007', campaign_id: 'TS-000002', branch_name: 'Panda - Al Khobar Corniche' },
      { id: 'br-008', campaign_id: 'TS-000002', branch_name: 'Panda - Madinah Central' },
    ],
    status: 'pending_distributor',
    created_by: 'demo-mgr-2',
    created_at: '2026-04-20',
    submitted_at: '2026-04-21',
  },

  // 3. Running campaign in draft status — BinDawood, Gandola, 1 month, 2 items
  {
    id: 'TS-000003',
    account: '10-024512', // BinDawood Holding
    classification: 'wholesale',
    spend_type: 'st-001', // Gandola
    duration_key: '1m',
    duration_months: 1,
    item_ids: ['ROS21645', 'ROS21670'],
    spend_amount: 3500,
    start_date: '2026-05-01',
    roshen_pct: 50,
    period_mode: 'match',
    before_start: '2026-04-01',
    before_end: '2026-04-30',
    after_start: '2026-05-01',
    after_end: '2026-05-31',
    branch_count: 2,
    branches: [
      { id: 'br-009', campaign_id: 'TS-000003', branch_name: 'BinDawood - Makkah Gate' },
      { id: 'br-010', campaign_id: 'TS-000003', branch_name: 'BinDawood - Jeddah South' },
    ],
    status: 'draft',
    created_by: 'demo-mgr-1',
    created_at: '2026-04-28',
  },

  // 4. Approved campaign with negative ROI (loss) — Danube, Floor Display, 1 month
  {
    id: 'TS-000004',
    account: '10-024523', // Danube Company
    classification: 'wholesale',
    spend_type: 'st-002', // Floor Display
    duration_key: '1m',
    duration_months: 1,
    item_ids: ['ROS21690', 'ROS21695', 'ROS21700'],
    spend_amount: 8000,
    start_date: '2026-04-01',
    roshen_pct: 50,
    period_mode: 'match',
    before_start: '2026-03-01',
    before_end: '2026-03-31',
    after_start: '2026-04-01',
    after_end: '2026-04-30',
    branch_count: 4,
    branches: [
      { id: 'br-011', campaign_id: 'TS-000004', branch_name: 'Danube - Riyadh Park' },
      { id: 'br-012', campaign_id: 'TS-000004', branch_name: 'Danube - Red Sea Mall' },
      { id: 'br-013', campaign_id: 'TS-000004', branch_name: 'Danube - Dhahran Mall' },
      { id: 'br-014', campaign_id: 'TS-000004', branch_name: 'Danube - Al Nakheel Mall' },
    ],
    status: 'approved',
    created_by: 'demo-mgr-2',
    created_at: '2026-03-10',
    submitted_at: '2026-03-11',
    approved_distributor_at: '2026-03-13',
    approved_roshen_at: '2026-03-15',
  },
];
