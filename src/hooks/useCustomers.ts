import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { Customer, Customer360 } from '@/lib/types';

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
      if (error) throw error;
      return (data ?? []) as Customer[];
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
