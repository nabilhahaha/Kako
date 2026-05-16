import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { Visit, NearExpiryRecord } from '@/lib/types';

export function usePendingVisits(supervisorId: string | undefined) {
  return useQuery({
    enabled: !!supervisorId,
    queryKey: qk.pendingVisits(supervisorId ?? ''),
    queryFn: async (): Promise<Visit[]> => {
      const { data, error } = await supabase
        .from('visits')
        .select('id, customer_id, user_id, visit_type, visited_at, latitude, longitude, notes, status')
        .eq('status', 'pending')
        .order('visited_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Visit[];
    },
  });
}

export function usePendingNearExpiry(supervisorId: string | undefined) {
  return useQuery({
    enabled: !!supervisorId,
    queryKey: qk.pendingNearExpiry(supervisorId ?? ''),
    queryFn: async (): Promise<NearExpiryRecord[]> => {
      const { data, error } = await supabase
        .from('near_expiry_records')
        .select('id, product_id, customer_id, reported_by, quantity, expiry_date, notes, status, photo_url, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as NearExpiryRecord[];
    },
  });
}

interface DecideVisitInput {
  visitId: string;
  decision: 'approved' | 'rejected';
  supervisorId: string;
}

export function useDecideVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visitId, decision }: DecideVisitInput) => {
      const { error } = await supabase
        .from('visits')
        .update({ status: decision })
        .eq('id', visitId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.pendingVisits(vars.supervisorId) });
    },
  });
}

interface DecideNearExpiryInput {
  recordId: string;
  decision: 'approved' | 'rejected';
  supervisorId: string;
  notes?: string;
}

// Supervisor stage: approval moves status → 'supervisor_approved' so the
// regional manager can finalize it. Rejection ends the flow.
export function useDecideNearExpiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recordId,
      decision,
      supervisorId,
      notes,
    }: DecideNearExpiryInput) => {
      const { error: approvalErr } = await supabase
        .from('near_expiry_approvals')
        .insert({
          record_id: recordId,
          approver_id: supervisorId,
          stage: 'supervisor',
          decision,
          notes: notes ?? null,
        });
      if (approvalErr) throw approvalErr;

      const nextStatus = decision === 'approved' ? 'supervisor_approved' : 'rejected';
      const { error: recordErr } = await supabase
        .from('near_expiry_records')
        .update({ status: nextStatus })
        .eq('id', recordId);
      if (recordErr) throw recordErr;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.pendingNearExpiry(vars.supervisorId) });
    },
  });
}
