import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { VisitReason } from '@/lib/types';
import type { VisitReasonEditValues } from '@/lib/schemas';
import { logAudit } from '@/lib/audit';

export function useReasonsAdmin() {
  return useQuery({
    queryKey: ['admin-visit-reasons'],
    queryFn: async (): Promise<VisitReason[]> => {
      const { data, error } = await supabase
        .from('visit_reasons_master')
        .select('id, label, label_ar, applies_to, is_active')
        .order('label_ar', { ascending: true });
      if (error) throw error;
      return (data ?? []) as VisitReason[];
    },
  });
}

interface ReasonInput {
  values: VisitReasonEditValues;
  id?: string;
  actorId: string;
}

export function useUpsertReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ values, id, actorId }: ReasonInput) => {
      const row = {
        label: values.label,
        label_ar: values.labelAr || null,
        applies_to: values.appliesTo || null,
        is_active: values.isActive,
      };
      if (id) {
        const { error } = await supabase
          .from('visit_reasons_master')
          .update(row)
          .eq('id', id);
        if (error) throw error;
        await logAudit({ actorId, action: 'update', entity: 'visit_reason', entityId: id });
      } else {
        const { data, error } = await supabase
          .from('visit_reasons_master')
          .insert(row)
          .select('id')
          .single();
        if (error) throw error;
        await logAudit({
          actorId,
          action: 'create',
          entity: 'visit_reason',
          entityId: data?.id as string,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-visit-reasons'] });
      qc.invalidateQueries({ queryKey: ['visit-reasons'] });
    },
  });
}
