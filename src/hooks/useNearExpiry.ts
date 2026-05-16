import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { Product } from '@/lib/types';
import type { NearExpiryValues } from '@/lib/schemas';

export function useProducts() {
  return useQuery({
    queryKey: qk.products(),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('id, product_code, product_name, product_name_ar, category, is_active')
        .eq('is_active', true)
        .order('product_name_ar', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
}

interface CreateNearExpiryInput {
  values: NearExpiryValues;
  photo: File | null;
  reportedBy: string;
}

export function useCreateNearExpiry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ values, photo, reportedBy }: CreateNearExpiryInput) => {
      let photoUrl: string | null = null;

      if (photo) {
        const ext = photo.name.split('.').pop() ?? 'jpg';
        const path = `${reportedBy}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('near-expiry-photos')
          .upload(path, photo, { contentType: photo.type, upsert: false });
        if (!uploadErr) {
          const { data: pub } = supabase.storage
            .from('near-expiry-photos')
            .getPublicUrl(path);
          photoUrl = pub.publicUrl;
        } else {
          console.warn('near-expiry photo upload failed', uploadErr);
        }
      }

      const { data, error } = await supabase
        .from('near_expiry_records')
        .insert({
          customer_id: values.customerId,
          product_id: values.productId,
          quantity: values.quantity,
          expiry_date: values.expiryDate,
          notes: values.notes || null,
          photo_url: photoUrl,
          reported_by: reportedBy,
          status: 'pending',
        })
        .select('id')
        .single();

      if (error || !data) throw error ?? new Error('فشل التسجيل');
      return { id: data.id as string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['near-expiry'] });
    },
  });
}
