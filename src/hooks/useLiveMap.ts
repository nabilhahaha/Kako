import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { Customer, Visit } from '@/lib/types';

interface LiveMapData {
  customers: Customer[];
  recentVisits: Visit[];
}

export function useLiveMapData(supervisorId: string | undefined, repIds: string[]) {
  const qc = useQueryClient();

  const query = useQuery({
    enabled: !!supervisorId && repIds.length > 0,
    queryKey: [...qk.liveMap(supervisorId ?? ''), repIds.join(',')],
    queryFn: async (): Promise<LiveMapData> => {
      const since = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

      const [{ data: customers, error: cErr }, { data: visits, error: vErr }] =
        await Promise.all([
          supabase
            .from('customers')
            .select(
              'id, customer_code, customer_name, customer_name_ar, channel_type, customer_grade, latitude, longitude, total_debt, overdue_amount, region, assigned_rep_id',
            )
            .in('assigned_rep_id', repIds.length ? repIds : ['00000000-0000-0000-0000-000000000000'])
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .limit(1000),
          supabase
            .from('visits')
            .select(
              'id, customer_id, user_id, visit_type, visited_at, latitude, longitude, notes, status',
            )
            .in('user_id', repIds)
            .gte('visited_at', since)
            .not('latitude', 'is', null)
            .order('visited_at', { ascending: false })
            .limit(500),
        ]);

      if (cErr) throw cErr;
      if (vErr) throw vErr;

      return {
        customers: (customers ?? []) as Customer[],
        recentVisits: (visits ?? []) as Visit[],
      };
    },
  });

  useEffect(() => {
    if (!supervisorId || repIds.length === 0) return;

    const channel = supabase
      .channel(`visits-${supervisorId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'visits' },
        (payload) => {
          const v = payload.new as Visit;
          if (repIds.includes(v.user_id)) {
            qc.invalidateQueries({ queryKey: qk.liveMap(supervisorId) });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supervisorId, repIds, qc]);

  return query;
}
