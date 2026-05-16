import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { VisitRequest } from '@/lib/types';
import type { VisitRequestValues } from '@/lib/schemas';

export function useVisitRequests(supervisorId: string | undefined) {
  return useQuery({
    enabled: !!supervisorId,
    queryKey: qk.visitRequests(supervisorId ?? ''),
    queryFn: async (): Promise<VisitRequest[]> => {
      const { data, error } = await supabase
        .from('visit_requests')
        .select('id, created_by, assigned_to, customer_id, notes, due_date, status, created_at')
        .eq('created_by', supervisorId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as VisitRequest[];
    },
  });
}

interface CreateVisitRequestInput {
  values: VisitRequestValues;
  supervisorId: string;
}

export function useCreateVisitRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ values, supervisorId }: CreateVisitRequestInput) => {
      const { error } = await supabase.from('visit_requests').insert({
        created_by: supervisorId,
        assigned_to: values.assignedTo,
        customer_id: values.customerId,
        due_date: values.dueDate,
        notes: values.notes || null,
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.visitRequests(vars.supervisorId) });
    },
  });
}
