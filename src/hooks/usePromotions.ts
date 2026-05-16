import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { Promotion } from '@/lib/types';
import type { PromotionValues } from '@/lib/schemas';
import { useAuthStore } from '@/stores/authStore';

export function usePromotions() {
  return useQuery({
    queryKey: qk.promotions(),
    staleTime: 30_000,
    queryFn: async (): Promise<Promotion[]> => {
      const { data, error } = await supabase
        .from('promotions')
        .select(
          'id, name, name_ar, status, start_date, end_date, channel_types, product_ids, expected_roi, actual_roi, trade_spend, notes, created_by, created_at',
        )
        .order('start_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Promotion[];
    },
  });
}

export function useCreatePromotion() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.profile?.id);

  return useMutation({
    mutationFn: async (values: PromotionValues) => {
      const { error } = await supabase.from('promotions').insert({
        name: values.name,
        name_ar: values.nameAr || null,
        status: values.status,
        start_date: values.startDate,
        end_date: values.endDate,
        channel_types: values.channelTypes,
        expected_roi: values.expectedRoi,
        trade_spend: values.tradeSpend,
        notes: values.notes || null,
        created_by: userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.promotions() });
    },
  });
}
