import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import type { ProductEditValues } from '@/lib/schemas';
import { logAudit } from '@/lib/audit';

interface ProductsPage {
  rows: Product[];
  total: number;
}

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
      if (error) throw error;
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
      const row = {
        product_code: values.productCode,
        product_name: values.productName,
        product_name_ar: values.productNameAr || null,
        category: values.category || null,
        is_active: values.isActive,
      };
      if (id) {
        const { error } = await supabase.from('products').update(row).eq('id', id);
        if (error) throw error;
        await logAudit({ actorId, action: 'update', entity: 'product', entityId: id });
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert(row)
          .select('id')
          .single();
        if (error) throw error;
        await logAudit({
          actorId,
          action: 'create',
          entity: 'product',
          entityId: data?.id as string,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
