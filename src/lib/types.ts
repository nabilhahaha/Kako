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
  salesman_id: string;
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
