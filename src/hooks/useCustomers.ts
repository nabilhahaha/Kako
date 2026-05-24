import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { Customer, Customer360 } from '@/lib/types';

const DEMO_CUSTOMERS: Customer[] = [
  { id: 'c001', customer_code: 'KSA-001', customer_name: 'Al Othaim Markets', customer_name_ar: 'أسواق العثيم', channel_type: 'MT', customer_grade: 'A', latitude: 24.7136, longitude: 46.6753, total_debt: 15000, overdue_amount: 2000, region: 'الرياض', assigned_rep_id: null },
  { id: 'c002', customer_code: 'KSA-002', customer_name: 'Panda Retail', customer_name_ar: 'بنده', channel_type: 'MT', customer_grade: 'A', latitude: 24.7255, longitude: 46.6420, total_debt: 22000, overdue_amount: 0, region: 'الرياض', assigned_rep_id: null },
  { id: 'c003', customer_code: 'KSA-003', customer_name: 'Bin Dawood', customer_name_ar: 'بن داود', channel_type: 'MT', customer_grade: 'A', latitude: 21.4858, longitude: 39.1925, total_debt: 18000, overdue_amount: 3500, region: 'جدة', assigned_rep_id: null },
  { id: 'c004', customer_code: 'KSA-004', customer_name: 'Danube Supermarket', customer_name_ar: 'الدانوب', channel_type: 'MT', customer_grade: 'A', latitude: 21.5169, longitude: 39.2192, total_debt: 25000, overdue_amount: 0, region: 'جدة', assigned_rep_id: null },
  { id: 'c005', customer_code: 'KSA-005', customer_name: 'Carrefour KSA', customer_name_ar: 'كارفور', channel_type: 'MT', customer_grade: 'A', latitude: 24.6877, longitude: 46.7219, total_debt: 30000, overdue_amount: 5000, region: 'الرياض', assigned_rep_id: null },
  { id: 'c006', customer_code: 'KSA-006', customer_name: 'Lulu Hypermarket', customer_name_ar: 'لولو هايبر', channel_type: 'MT', customer_grade: 'B', latitude: 24.7477, longitude: 46.6441, total_debt: 12000, overdue_amount: 1000, region: 'الرياض', assigned_rep_id: null },
  { id: 'c007', customer_code: 'KSA-007', customer_name: 'Farm Superstores', customer_name_ar: 'المزرعة', channel_type: 'MT', customer_grade: 'B', latitude: 24.6333, longitude: 46.7167, total_debt: 8000, overdue_amount: 0, region: 'الرياض', assigned_rep_id: null },
  { id: 'c008', customer_code: 'KSA-008', customer_name: 'Tamimi Markets', customer_name_ar: 'التميمي', channel_type: 'MT', customer_grade: 'A', latitude: 26.4207, longitude: 50.0888, total_debt: 20000, overdue_amount: 0, region: 'الشرقية', assigned_rep_id: null },
  { id: 'c009', customer_code: 'KSA-009', customer_name: 'Nesto Hypermarket', customer_name_ar: 'نستو', channel_type: 'WS', customer_grade: 'B', latitude: 26.3927, longitude: 50.1146, total_debt: 6000, overdue_amount: 800, region: 'الشرقية', assigned_rep_id: null },
  { id: 'c010', customer_code: 'KSA-010', customer_name: 'Manuel Market', customer_name_ar: 'مانويل', channel_type: 'MT', customer_grade: 'B', latitude: 24.7000, longitude: 46.6850, total_debt: 9500, overdue_amount: 0, region: 'الرياض', assigned_rep_id: null },
  { id: 'c011', customer_code: 'KSA-011', customer_name: 'Baqala Al Noor', customer_name_ar: 'بقالة النور', channel_type: 'TT', customer_grade: 'C', latitude: 24.6500, longitude: 46.7100, total_debt: 1200, overdue_amount: 500, region: 'الرياض', assigned_rep_id: null },
  { id: 'c012', customer_code: 'KSA-012', customer_name: 'Mini Market Salam', customer_name_ar: 'ميني ماركت السلام', channel_type: 'TT', customer_grade: 'C', latitude: 24.7300, longitude: 46.6600, total_debt: 800, overdue_amount: 0, region: 'الرياض', assigned_rep_id: null },
  { id: 'c013', customer_code: 'KSA-013', customer_name: 'Wholesale Center', customer_name_ar: 'مركز الجملة', channel_type: 'WS', customer_grade: 'B', latitude: 21.4900, longitude: 39.1800, total_debt: 45000, overdue_amount: 8000, region: 'جدة', assigned_rep_id: null },
  { id: 'c014', customer_code: 'KSA-014', customer_name: 'Al Raya Supermarket', customer_name_ar: 'الراية', channel_type: 'MT', customer_grade: 'B', latitude: 24.6900, longitude: 46.7050, total_debt: 11000, overdue_amount: 1500, region: 'الرياض', assigned_rep_id: null },
  { id: 'c015', customer_code: 'KSA-015', customer_name: 'Baqala Al Khair', customer_name_ar: 'بقالة الخير', channel_type: 'TT', customer_grade: 'C', latitude: 26.4100, longitude: 50.0950, total_debt: 600, overdue_amount: 0, region: 'الشرقية', assigned_rep_id: null },
];

export function useCustomers(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: qk.customers(userId ?? ''),
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase
        .from('customers')
        .select(
          'id, customer_code, customer_name, customer_name_ar, channel_type, customer_grade, latitude, longitude, total_debt, overdue_amount, region, assigned_rep_id',
        )
        .order('customer_grade', { ascending: true })
        .order('customer_name', { ascending: true });
      if (error || !data || data.length === 0) {
        return DEMO_CUSTOMERS;
      }
      return data as Customer[];
    },
  });
}

export function useCustomer360(customerId: string | undefined) {
  return useQuery({
    enabled: !!customerId,
    queryKey: qk.customer360(customerId ?? ''),
    queryFn: async (): Promise<Customer360 | null> => {
      const { data, error } = await supabase.rpc('get_customer_360', {
        p_customer_id: customerId,
      });
      if (error) throw error;
      return (data ?? null) as Customer360 | null;
    },
  });
}
