import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { FinancialDataRequest } from '@/lib/types';
import type { FinancialRequestValues } from '@/lib/schemas';

export function useFinancialRequests(supervisorId: string | undefined) {
  return useQuery({
    enabled: !!supervisorId,
    queryKey: qk.financialRequests(supervisorId ?? ''),
    refetchInterval: 15_000,
    queryFn: async (): Promise<FinancialDataRequest[]> => {
      const { data, error } = await supabase
        .from('financial_data_requests')
        .select('id, requested_by, customer_id, expires_at, payload, status, created_at')
        .eq('requested_by', supervisorId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as FinancialDataRequest[];
    },
  });
}

interface CreateFinancialRequestInput {
  values: FinancialRequestValues;
  supervisorId: string;
}

export function useCreateFinancialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ values, supervisorId }: CreateFinancialRequestInput) => {
      const expiresAt = new Date(Date.now() + values.ttlMinutes * 60_000).toISOString();
      const { error } = await supabase.from('financial_data_requests').insert({
        requested_by: supervisorId,
        customer_id: values.customerId,
        expires_at: expiresAt,
        payload: { reason: values.reason },
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.financialRequests(vars.supervisorId) });
    },
  });
}
