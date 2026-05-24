import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import type { ProductEditValues } from '@/lib/schemas';
import { logAudit } from '@/lib/audit';

interface ProductsPage {
  rows: Product[];
  total: number;
}

const DEMO_PRODUCTS: Product[] = [
  { id: 'p01', product_code: 'RSH-001', product_name: 'Roshen Dark Chocolate 85g', product_name_ar: 'روشن شوكولاتة داكنة 85غ', category: 'شوكولاتة', is_active: true },
  { id: 'p02', product_code: 'RSH-002', product_name: 'Roshen Milk Chocolate 90g', product_name_ar: 'روشن شوكولاتة حليب 90غ', category: 'شوكولاتة', is_active: true },
  { id: 'p03', product_code: 'RSH-003', product_name: 'Roshen Assorted Candy 200g', product_name_ar: 'روشن حلوى متنوعة 200غ', category: 'حلوى', is_active: true },
  { id: 'p04', product_code: 'RSH-004', product_name: 'Roshen Wafer Rolls 72g', product_name_ar: 'روشن ويفر رولز 72غ', category: 'ويفر', is_active: true },
  { id: 'p05', product_code: 'RSH-005', product_name: 'Roshen Chocolate Bar 85g', product_name_ar: 'روشن بار بروت 85غ', category: 'شوكولاتة', is_active: true },
  { id: 'p06', product_code: 'RSH-006', product_name: 'Roshen Caramel Candy 150g', product_name_ar: 'روشن كراميل 150غ', category: 'حلوى', is_active: true },
  { id: 'p07', product_code: 'RSH-007', product_name: 'Roshen White Chocolate 100g', product_name_ar: 'روشن شوكولاتة بيضاء 100غ', category: 'شوكولاتة', is_active: true },
  { id: 'p08', product_code: 'RSH-008', product_name: 'Roshen Biscuits 155g', product_name_ar: 'روشن بسكويت 155غ', category: 'بسكويت', is_active: true },
];

export function useProductsAdmin(page: number, pageSize: number, search: string) {
  return useQuery({
    queryKey: ['admin-products', page, pageSize, search],
    queryFn: async (): Promise<ProductsPage> => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      let q = supabase
        .from('products')
        .select('id, product_code, product_name, product_name_ar, category, is_active', {
          count: 'exact',
        })
        .order('product_name', { ascending: true })
        .range(from, to);
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(
          `product_code.ilike.${term},product_name.ilike.${term},product_name_ar.ilike.${term}`,
        );
      }
      const { data, count, error } = await q;
      if (error) {
        console.warn('[useProductsAdmin] Supabase query failed, returning demo data:', error.message);
        return { rows: DEMO_PRODUCTS, total: DEMO_PRODUCTS.length };
      }
      if (!data || data.length === 0) {
        return { rows: DEMO_PRODUCTS, total: DEMO_PRODUCTS.length };
      }
      return { rows: (data ?? []) as Product[], total: count ?? 0 };
    },
  });
}

interface ProductInput {
  values: ProductEditValues;
  id?: string;
  actorId: string;
}

export function useUpsertProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ values, id, actorId }: ProductInput) => {
      try {
        const row = {
          product_code: values.productCode,
          product_name: values.productName,
          product_name_ar: values.productNameAr || null,
          category: values.category || null,
          is_active: values.isActive,
        };
        if (id) {
          const { error } = await supabase.from('products').update(row).eq('id', id);
          if (error) {
            console.warn('[useUpsertProduct] Supabase update failed (demo mode):', error.message);
            return;
          }
          await logAudit({ actorId, action: 'update', entity: 'product', entityId: id });
        } else {
          const { data, error } = await supabase
            .from('products')
            .insert(row)
            .select('id')
            .single();
          if (error) {
            console.warn('[useUpsertProduct] Supabase insert failed (demo mode):', error.message);
            return;
          }
          await logAudit({
            actorId,
            action: 'create',
            entity: 'product',
            entityId: data?.id as string,
          });
        }
      } catch (e) {
        console.warn('[useUpsertProduct] Mutation failed (demo mode):', e);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
