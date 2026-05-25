// Trade spend roles — note: "Distributor" replaces what was originally "Relaia"
export type TradeSpendRole =
  | 'dept_manager'           // Department Manager (creates requests)
  | 'distributor_trade_mktg' // Distributor Trade Marketing (reviews, edits, forwards)
  | 'roshen_approver'        // Roshen Approver (final approval)
  | 'viewer'                 // Read-only viewer
  | 'admin';                 // Admin (upload data, manage users)

export interface Distributor {
  id: string;
  name: string;
  code: string;
  active: boolean;
  created_at: string;
}

export interface TradeSpendUser {
  id: string;
  email: string;
  display_name: string;
  roles: TradeSpendRole[];
  active: boolean;
  password: string;
  created_at: string;
}

// Classification for customers - manual commercial type
export type CustomerClassification =
  | 'wholesale'    // جملة
  | 'discounter'   // ديسكونتر
  | 'roastery'     // محامص
  | 'grocery'      // بقالة
  | 'sweets'       // حلويات
  | string;        // custom values

export interface TradeSpendCustomer {
  account: string;  // PK, e.g. "10-024446"
  name: string;
  class?: string;   // ERP credit class
  channel?: string; // TRADITIONAL / MODERN / E-commerce
  classification?: CustomerClassification;
  created_at: string;
}

export interface TradeSpendItem {
  id: string;         // Product code e.g. "ROS21635"
  description: string;
}

export interface SalesTransaction {
  id: string;
  account: string;      // FK customer
  item_id: string;
  date: string;         // ISO date
  value_ex_vat: number; // Signed: returns are negative
  cases: number;        // Signed: returns negative
}

export interface SpendType {
  id: string;
  name: string;
}

export type DurationKey = 'none' | '1m' | '3m' | '6m' | '1y';

export type PeriodMode = 'match' | 'days' | 'dates';

export type CampaignStatus =
  | 'draft'
  | 'pending_distributor'   // was "pending_relaia"
  | 'pending_roshen'
  | 'approved_pending_photos'  // Roshen approved budget, waiting for execution photos
  | 'photos_submitted'         // Photos added, waiting for Roshen final approval
  | 'final_approved'           // Roshen final approval with photos
  | 'changes_requested'
  | 'rejected';

export interface CampaignBranch {
  id: string;
  campaign_id: string;
  branch_name: string;
  photo_url?: string;
}

export interface Campaign {
  id: string;                    // e.g. "TS-000123"
  account: string;               // FK customer
  classification?: CustomerClassification;
  spend_type: string;
  duration_key: DurationKey;
  duration_months?: number;      // null for "none"
  item_ids: string[];
  spend_amount: number;
  start_date: string;            // ISO date
  roshen_pct: number;            // default 50
  period_mode: PeriodMode;
  custom_days?: number;
  before_start?: string;
  before_end?: string;
  after_start?: string;
  after_end?: string;
  branch_count: number;
  branches: CampaignBranch[];
  status: CampaignStatus;
  created_by: string;
  created_at: string;
  submitted_at?: string;
  approved_distributor_at?: string;
  approved_roshen_at?: string;
  photos_submitted_at?: string;
  final_approved_at?: string;
  rejected_at?: string;
}

// ROI Engine output
export interface CampaignMetrics {
  // Sales sums (value)
  selected_before_value: number;
  selected_after_value: number;
  all_before_value: number;
  all_after_value: number;
  // Sales sums (cases)
  selected_before_cases: number;
  selected_after_cases: number;
  all_before_cases: number;
  all_after_cases: number;
  // Computed metrics
  uplift_value: number;
  uplift_cases: number;
  uplift_pct: number | null;
  roshen_share: number;
  distributor_share: number;     // was "relaia_share"
  roi_total: number | null;
  roi_roshen: number | null;     // PRIMARY KPI
  spend_to_sales_pct: number | null;
  annualized_roi_roshen: number | null;
  payback_days: number | null;
  spend_per_incremental_case: number | null;
  realized_price_before: number | null;
  realized_price_after: number | null;
  cannibalization_flag: boolean;
  // Status
  data_completeness: { captured_days: number; total_days: number; is_complete: boolean };
  result_status: 'running' | 'win' | 'loss';
  is_expiring: boolean;
}

// Column mapping for dynamic data import
export interface ColumnMappingConfig {
  customer_account: string;   // maps to source column name
  customer_name: string;
  customer_class: string;
  customer_channel: string;
  item_id: string;
  item_description: string;
  invoice_date: string;
  invoice_amount: string;     // value ex VAT
  invoice_qty_cases: string;
  is_return: string;          // optional/informational
}

export interface AppNotification {
  id: string;
  type: 'approval_pending' | 'approved' | 'rejected' | 'changes_requested' | 'photos_needed' | 'info';
  title: string;
  message: string;
  campaignId?: string;
  read: boolean;
  timestamp: string;
}

export interface DataUploadSummary {
  total_rows: number;
  valid_rows: number;
  dropped_rows: number;
  customers_count: number;
  items_count: number;
  date_range: { min: string; max: string };
}

// Workflow events for audit trail
export type WorkflowAction =
  | 'created'
  | 'submitted'
  | 'edited'
  | 'changes_requested'
  | 'approved_distributor'   // was "approved_relaia"
  | 'approved_roshen'        // budget approval (stage 3)
  | 'photos_added'           // photos uploaded after execution
  | 'final_approved'         // Roshen final approval with photos
  | 'rejected'               // explicitly rejected
  | 'returned';

export interface WorkflowEvent {
  id: string;
  campaign_id: string;
  actor_user_id: string;
  action: WorkflowAction;
  note?: string;
  timestamp: string;
}

// Duration mapping
export const DURATION_MAP: Record<DurationKey, number | null> = {
  none: null,
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '1y': 12,
};

// Required fields for column mapping — these MUST be mapped
export const REQUIRED_MAPPING_FIELDS: (keyof ColumnMappingConfig)[] = [
  'customer_account',
  'item_id',
  'invoice_date',
  'invoice_amount',
  'invoice_qty_cases',
];

// Optional fields — nice to have but not blocking
export const OPTIONAL_MAPPING_FIELDS: (keyof ColumnMappingConfig)[] = [
  'customer_name',
  'customer_class',
  'customer_channel',
  'item_description',
  'is_return',
];
