import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AuditLog } from '@/lib/types';

interface LogsPage {
  rows: AuditLog[];
  total: number;
}

const DEMO_AUDIT_LOGS: AuditLog[] = [
  { id: 'log-01', actor_id: 'demo-admin', action: 'create', entity: 'product', entity_id: 'p01', metadata: { product_name: 'Roshen Dark Chocolate 85g' }, created_at: '2026-05-24T08:00:00Z' },
  { id: 'log-02', actor_id: 'demo-admin', action: 'update', entity: 'user', entity_id: 'demo-rep', metadata: { user_type: 'presales_rep' }, created_at: '2026-05-24T07:30:00Z' },
  { id: 'log-03', actor_id: 'demo-admin', action: 'create', entity: 'visit_reason', entity_id: 'r01', metadata: { label: 'Routine Visit' }, created_at: '2026-05-24T07:00:00Z' },
  { id: 'log-04', actor_id: 'demo-supervisor', action: 'update', entity: 'product', entity_id: 'p03', metadata: { product_name: 'Roshen Assorted Candy 200g' }, created_at: '2026-05-23T16:00:00Z' },
  { id: 'log-05', actor_id: 'demo-admin', action: 'deactivate', entity: 'user', entity_id: 'demo-rep', metadata: {}, created_at: '2026-05-23T12:00:00Z' },
];

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
      if (error) {
        console.warn('[useAuditLogs] Supabase query failed, returning demo data:', error.message);
        return { rows: DEMO_AUDIT_LOGS, total: DEMO_AUDIT_LOGS.length };
      }
      if (!data || data.length === 0) {
        return { rows: DEMO_AUDIT_LOGS, total: DEMO_AUDIT_LOGS.length };
      }
      return { rows: (data ?? []) as AuditLog[], total: count ?? 0 };
    },
  });
}
