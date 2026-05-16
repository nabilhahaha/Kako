import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { NearExpiryRecord } from '@/lib/types';

export function useRegionalApprovalQueue() {
  return useQuery({
    queryKey: qk.regionalApprovals(),
    staleTime: 30_000,
    queryFn: async (): Promise<NearExpiryRecord[]> => {
      const { data, error } = await supabase
        .from('near_expiry_records')
        .select(
          'id, product_id, customer_id, reported_by, quantity, expiry_date, notes, status, photo_url, created_at',
        )
        .eq('status', 'supervisor_approved')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as NearExpiryRecord[];
    },
  });
}

interface FinalizeInput {
  recordId: string;
  decision: 'approved' | 'rejected';
  approverId: string;
  notes?: string;
}

export function useFinalizeNearExpiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ recordId, decision, approverId, notes }: FinalizeInput) => {
      const { error: approvalErr } = await supabase
        .from('near_expiry_approvals')
        .insert({
          record_id: recordId,
          approver_id: approverId,
          stage: 'regional',
          decision,
          notes: notes ?? null,
        });
      if (approvalErr) throw approvalErr;

      const { error: recordErr } = await supabase
        .from('near_expiry_records')
        .update({ status: decision })
        .eq('id', recordId);
      if (recordErr) throw recordErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.regionalApprovals() });
      qc.invalidateQueries({ queryKey: qk.nearExpiryAnalytics() });
    },
  });
}
