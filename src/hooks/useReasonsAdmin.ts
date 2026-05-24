import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { VisitReason } from '@/lib/types';
import type { VisitReasonEditValues } from '@/lib/schemas';
import { logAudit } from '@/lib/audit';

const DEMO_REASONS: VisitReason[] = [
  { id: 'r01', label: 'Routine Visit', label_ar: 'زيارة روتينية', applies_to: 'all', is_active: true },
  { id: 'r02', label: 'New Product Launch', label_ar: 'إطلاق منتج جديد', applies_to: 'all', is_active: true },
  { id: 'r03', label: 'Shelf Arrangement', label_ar: 'ترتيب الرف', applies_to: 'all', is_active: true },
  { id: 'r04', label: 'Stock Check', label_ar: 'جرد المخزون', applies_to: 'all', is_active: true },
  { id: 'r05', label: 'Promotion Follow-up', label_ar: 'متابعة العرض', applies_to: 'all', is_active: true },
  { id: 'r06', label: 'Payment Collection', label_ar: 'تحصيل مبالغ', applies_to: 'all', is_active: true },
  { id: 'r07', label: 'Near Expiry Check', label_ar: 'فحص قارب على الانتهاء', applies_to: 'all', is_active: true },
];

export function useReasonsAdmin() {
  return useQuery({
    queryKey: ['admin-visit-reasons'],
    queryFn: async (): Promise<VisitReason[]> => {
      const { data, error } = await supabase
        .from('visit_reasons_master')
        .select('id, label, label_ar, applies_to, is_active')
        .order('label_ar', { ascending: true });
      if (error) {
        console.warn('[useReasonsAdmin] Supabase query failed, returning demo data:', error.message);
        return DEMO_REASONS;
      }
      if (!data || data.length === 0) {
        return DEMO_REASONS;
      }
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
      try {
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
          if (error) {
            console.warn('[useUpsertReason] Supabase update failed (demo mode):', error.message);
            return;
          }
          await logAudit({ actorId, action: 'update', entity: 'visit_reason', entityId: id });
        } else {
          const { data, error } = await supabase
            .from('visit_reasons_master')
            .insert(row)
            .select('id')
            .single();
          if (error) {
            console.warn('[useUpsertReason] Supabase insert failed (demo mode):', error.message);
            return;
          }
          await logAudit({
            actorId,
            action: 'create',
            entity: 'visit_reason',
            entityId: data?.id as string,
          });
        }
      } catch (e) {
        console.warn('[useUpsertReason] Mutation failed (demo mode):', e);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-visit-reasons'] });
      qc.invalidateQueries({ queryKey: ['visit-reasons'] });
    },
  });
}
