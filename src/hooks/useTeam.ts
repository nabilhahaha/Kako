import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { AppUser, TeamMemberPerformance } from '@/lib/types';

export function useTeamReps(supervisorId: string | undefined) {
  return useQuery({
    enabled: !!supervisorId,
    queryKey: qk.teamReps(supervisorId ?? ''),
    queryFn: async (): Promise<AppUser[]> => {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, role, region, supervisor_id, is_active')
        .eq('supervisor_id', supervisorId)
        .eq('is_active', true)
        .order('full_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AppUser[];
    },
  });
}

export function useTeamPerformance(supervisorId: string | undefined) {
  return useQuery({
    enabled: !!supervisorId,
    queryKey: qk.team(supervisorId ?? ''),
    queryFn: async (): Promise<TeamMemberPerformance[]> => {
      const { data, error } = await supabase
        .from('v_salesman_performance')
        .select('*');
      if (error) throw error;
      return (data ?? []) as TeamMemberPerformance[];
    },
  });
}
