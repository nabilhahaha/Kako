export type UserRole =
  | 'admin_relia'
  | 'presales_rep'
  | 'presales_supervisor'
  | 'cashvan_supervisor'
  | 'regional_manager_roshen'
  | 'trade_marketing_manager'
  | 'top_management_relia'
  | 'top_management_roshen';

export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole | null;
  region: string | null;
  supervisor_id: string | null;
  is_active: boolean;
}

export type CustomerGrade = 'A' | 'B' | 'C';

export type ChannelType = 'TT' | 'WS' | 'DS' | 'MT' | 'SW';

export interface Customer {
  id: string;
  customer_code: string;
  customer_name: string | null;
  customer_name_ar: string | null;
  channel_type: ChannelType | string | null;
  customer_grade: CustomerGrade | string | null;
  latitude: number | null;
  longitude: number | null;
  total_debt: number | null;
  overdue_amount: number | null;
  region: string | null;
  assigned_rep_id: string | null;
}

export type VisitType = 'office' | 'branch' | 'cashvan' | 'hybrid';

export interface Visit {
  id: string;
  customer_id: string;
  user_id: string;
  visit_type: VisitType | string;
  visited_at: string;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  status: string | null;
}

export interface SalesmanDashboard {
  strike_rate: number | null;
  drop_size: number | null;
  coverage_percent: number | null;
  performance_status: string | null;
}

export interface Customer360 {
  customer_id: string;
  customer_code: string;
  customer_name: string | null;
  customer_name_ar: string | null;
  channel_type: string | null;
  customer_grade: string | null;
  health_score: number | null;
  recommended_action: string | null;
  total_debt: number | null;
  overdue_amount: number | null;
  total_visits: number | null;
  days_since_last_visit: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface VisitReason {
  id: string;
  label: string;
  label_ar: string | null;
  applies_to: string | null;
  is_active: boolean | null;
}

export interface Product {
  id: string;
  product_code: string;
  product_name: string;
  product_name_ar: string | null;
  category: string | null;
  is_active: boolean | null;
}

export interface NearExpiryRecord {
  id: string;
  product_id: string;
  customer_id: string;
  reported_by: string;
  quantity: number;
  expiry_date: string;
  notes: string | null;
  status: string | null;
  photo_url: string | null;
  created_at: string;
}

export interface GPSCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}

export interface TeamMemberPerformance {
  user_id: string;
  full_name: string | null;
  email: string | null;
  strike_rate: number | null;
  drop_size: number | null;
  coverage_percent: number | null;
  performance_status: string | null;
  total_visits: number | null;
  last_visit_at: string | null;
}

export interface VisitRequest {
  id: string;
  created_by: string;
  assigned_to: string;
  customer_id: string;
  notes: string | null;
  due_date: string | null;
  status: string | null;
  created_at: string;
}

export interface FinancialDataRequest {
  id: string;
  requested_by: string;
  customer_id: string;
  expires_at: string;
  payload: Record<string, unknown> | null;
  status: string | null;
  created_at: string;
}

export interface NearExpiryApproval {
  id: string;
  record_id: string;
  approver_id: string;
  stage: string | null;
  decision: 'approved' | 'rejected' | null;
  notes: string | null;
  created_at: string;
}

export type PromotionStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export interface Promotion {
  id: string;
  name: string;
  name_ar: string | null;
  status: PromotionStatus;
  start_date: string;
  end_date: string;
  channel_types: string[];
  product_ids: string[];
  expected_roi: number | null;
  actual_roi: number | null;
  trade_spend: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface RegionStats {
  region: string;
  customers: number;
  active_customers: number;
  coverage_percent: number;
  visits_30d: number;
  overdue_count: number;
}

export interface ChannelStats {
  channel: string;
  customers: number;
  visits_30d: number;
  total_debt: number;
  overdue_amount: number;
}

export interface NearExpiryAggregate {
  status: string;
  count: number;
  total_quantity: number;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface RawDataMapping {
  id: string;
  source: string;
  target_field: string;
  source_field: string;
  is_active: boolean | null;
  created_at: string;
}

export interface ExecutiveKPIs {
  totalRevenue30d: number;
  totalRevenuePrev30d: number;
  totalVisits30d: number;
  totalVisitsPrev30d: number;
  totalCustomers: number;
  activeCustomers30d: number;
  totalReps: number;
  coveragePercent: number;
  totalOverdue: number;
  totalDebt: number;
  pendingApprovals: number;
  atRiskQuantity: number;
}

export interface Anomaly {
  id: string;
  severity: 'high' | 'medium' | 'low';
  metric: string;
  message: string;
  detected_at: string;
  delta_percent: number;
}
