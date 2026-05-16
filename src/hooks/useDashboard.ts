import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { SalesmanDashboard } from '@/lib/types';

export function useSalesmanDashboard(userId: string | undefined, periodDays = 30) {
  return useQuery({
    enabled: !!userId,
    queryKey: qk.dashboard(userId ?? '', periodDays),
    queryFn: async (): Promise<SalesmanDashboard> => {
      const { data, error } = await supabase.rpc('get_salesman_dashboard', {
        p_salesman_id: userId,
        p_period_days: periodDays,
      });
      if (error) throw error;
      return (data ?? {}) as SalesmanDashboard;
    },
  });
}
