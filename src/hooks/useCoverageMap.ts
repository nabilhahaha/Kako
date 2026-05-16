import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { Customer } from '@/lib/types';

export function useCoverageCustomers(region: string | null) {
  return useQuery({
    queryKey: qk.coverageMap(region),
    staleTime: 60_000,
    queryFn: async (): Promise<Customer[]> => {
      let q = supabase
        .from('customers')
        .select(
          'id, customer_code, customer_name, customer_name_ar, channel_type, customer_grade, latitude, longitude, total_debt, overdue_amount, region, assigned_rep_id',
        )
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(2000);
      if (region) q = q.eq('region', region);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });
}
