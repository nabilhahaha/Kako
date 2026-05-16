import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalCustomers: number;
  visits24h: number;
  pendingApprovals: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<AdminStats> => {
      const since = new Date(Date.now() - DAY_MS).toISOString();
      const [
        { count: totalUsers, error: u1 },
        { count: activeUsers, error: u2 },
        { count: totalCustomers, error: cErr },
        { count: visits24h, error: vErr },
        { count: pendingVisits, error: pvErr },
        { count: pendingNE, error: pneErr },
      ] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase
          .from('visits')
          .select('id', { count: 'exact', head: true })
          .gte('visited_at', since),
        supabase
          .from('visits')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('near_expiry_records')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'supervisor_approved']),
      ]);
      if (u1) throw u1;
      if (u2) throw u2;
      if (cErr) throw cErr;
      if (vErr) throw vErr;
      if (pvErr) throw pvErr;
      if (pneErr) throw pneErr;
      return {
        totalUsers: totalUsers ?? 0,
        activeUsers: activeUsers ?? 0,
        totalCustomers: totalCustomers ?? 0,
        visits24h: visits24h ?? 0,
        pendingApprovals: (pendingVisits ?? 0) + (pendingNE ?? 0),
      };
    },
  });
}
