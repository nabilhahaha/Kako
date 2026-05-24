import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { Product } from '@/lib/types';
import type { NearExpiryValues } from '@/lib/schemas';

const DEMO_PRODUCTS: Product[] = [
  { id: 'p01', product_code: 'RSH-001', product_name: 'Roshen Dark Chocolate 85g', product_name_ar: 'روشن شوكولاتة داكنة 85غ', category: 'شوكولاتة', is_active: true },
  { id: 'p02', product_code: 'RSH-002', product_name: 'Roshen Milk Chocolate 90g', product_name_ar: 'روشن شوكولاتة حليب 90غ', category: 'شوكولاتة', is_active: true },
  { id: 'p03', product_code: 'RSH-003', product_name: 'Roshen Assorted Candy 200g', product_name_ar: 'روشن حلوى متنوعة 200غ', category: 'حلوى', is_active: true },
  { id: 'p04', product_code: 'RSH-004', product_name: 'Roshen Wafer Rolls 72g', product_name_ar: 'روشن ويفر رولز 72غ', category: 'ويفر', is_active: true },
  { id: 'p05', product_code: 'RSH-005', product_name: 'Roshen Chocolate Bar Brut 85g', product_name_ar: 'روشن بار بروت 85غ', category: 'شوكولاتة', is_active: true },
  { id: 'p06', product_code: 'RSH-006', product_name: 'Roshen Caramel Candy 150g', product_name_ar: 'روشن كراميل 150غ', category: 'حلوى', is_active: true },
  { id: 'p07', product_code: 'RSH-007', product_name: 'Roshen White Chocolate 100g', product_name_ar: 'روشن شوكولاتة بيضاء 100غ', category: 'شوكولاتة', is_active: true },
  { id: 'p08', product_code: 'RSH-008', product_name: 'Roshen Biscuits 155g', product_name_ar: 'روشن بسكويت 155غ', category: 'بسكويت', is_active: true },
  { id: 'p09', product_code: 'RSH-009', product_name: 'Roshen Jelly Candy 200g', product_name_ar: 'روشن حلوى جيلي 200غ', category: 'حلوى', is_active: true },
  { id: 'p10', product_code: 'RSH-010', product_name: 'Roshen Hazelnut Chocolate 90g', product_name_ar: 'روشن شوكولاتة بندق 90غ', category: 'شوكولاتة', is_active: true },
  { id: 'p11', product_code: 'RSH-011', product_name: 'Roshen Toffee 250g', product_name_ar: 'روشن توفي 250غ', category: 'حلوى', is_active: true },
  { id: 'p12', product_code: 'RSH-012', product_name: 'Roshen Wafer Sandwich 130g', product_name_ar: 'روشن ويفر ساندويتش 130غ', category: 'ويفر', is_active: true },
  { id: 'p13', product_code: 'RSH-013', product_name: 'Roshen Chocolate Box 256g', product_name_ar: 'روشن علبة شوكولاتة 256غ', category: 'شوكولاتة', is_active: true },
  { id: 'p14', product_code: 'RSH-014', product_name: 'Roshen Lollipop Pack 10pcs', product_name_ar: 'روشن مصاصات 10 حبات', category: 'حلوى', is_active: true },
  { id: 'p15', product_code: 'RSH-015', product_name: 'Roshen Cream Fudge 200g', product_name_ar: 'روشن كريم فدج 200غ', category: 'حلوى', is_active: true },
];

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
      if (error || !data || data.length === 0) {
        return DEMO_PRODUCTS;
      }
      return data as Product[];
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
