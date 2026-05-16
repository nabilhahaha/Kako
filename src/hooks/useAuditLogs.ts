import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AuditLog } from '@/lib/types';

interface LogsPage {
  rows: AuditLog[];
  total: number;
}

export function useAuditLogs(page: number, pageSize: number) {
  return useQuery({
    queryKey: ['admin-audit-logs', page, pageSize],
    queryFn: async (): Promise<LogsPage> => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, count, error } = await supabase
        .from('audit_logs')
        .select('id, actor_id, action, entity, entity_id, metadata, created_at', {
          count: 'exact',
        })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as AuditLog[], total: count ?? 0 };
    },
  });
}
