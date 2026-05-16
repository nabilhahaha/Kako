import { useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonRow } from '@/components/shared/SkeletonCard';
import { ApprovalCard } from '@/components/supervisor/ApprovalCard';
import {
  useRegionalApprovalQueue,
  useFinalizeNearExpiry,
} from '@/hooks/useRegionalApprovals';
import { useProducts } from '@/hooks/useNearExpiry';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { formatNumber } from '@/lib/utils';

function useCustomerNames(ids: string[]) {
  return useQuery({
    enabled: ids.length > 0,
    queryKey: ['customer-names', ids.slice().sort().join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, customer_name, customer_name_ar, customer_code')
        .in('id', ids);
      if (error) throw error;
      const m = new Map<string, string>();
      (data ?? []).forEach((c) =>
        m.set(c.id, c.customer_name_ar || c.customer_name || c.customer_code),
      );
      return m;
    },
  });
}

export function ApprovalQueuePage() {
  const profile = useAuthStore((s) => s.profile);
  const queueQ = useRegionalApprovalQueue();
  const productsQ = useProducts();
  const finalize = useFinalizeNearExpiry();

  const customerIds = useMemo(
    () => Array.from(new Set((queueQ.data ?? []).map((r) => r.customer_id))),
    [queueQ.data],
  );
  const namesQ = useCustomerNames(customerIds);

  const productName = useMemo(() => {
    const m = new Map<string, string>();
    (productsQ.data ?? []).forEach((p) =>
      m.set(p.id, p.product_name_ar || p.product_name),
    );
    return m;
  }, [productsQ.data]);

  async function decide(recordId: string, decision: 'approved' | 'rejected') {
    if (!profile?.id) return;
    try {
      await finalize.mutateAsync({ recordId, decision, approverId: profile.id });
      toast.success(decision === 'approved' ? 'تم الاعتماد النهائي' : 'تم الرفض');
    } catch (err) {
      toast.error('فشل التحديث', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="قائمة الموافقات النهائية"
        description="عناصر اعتمدها المشرف وتنتظر اعتمادك النهائي"
        back="/regional"
      />

      {queueQ.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : queueQ.isError ? (
        <ErrorState
          message={(queueQ.error as Error)?.message}
          onRetry={() => queueQ.refetch()}
        />
      ) : !queueQ.data?.length ? (
        <EmptyState
          icon={ShieldCheck}
          title="لا توجد عناصر معلّقة"
          description="ستظهر هنا الطلبات بعد اعتماد المشرف لها."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {queueQ.data.map((r) => (
            <ApprovalCard
              key={r.id}
              title={productName.get(r.product_id) ?? 'منتج'}
              meta={
                <span className="flex flex-wrap items-center gap-2">
                  <span>{namesQ.data?.get(r.customer_id) ?? '—'}</span>
                  <span>·</span>
                  <span>الكمية {formatNumber(r.quantity)}</span>
                  <span>·</span>
                  <span>
                    ينتهي {new Date(r.expiry_date).toLocaleDateString('ar-SA')}
                  </span>
                  <span>·</span>
                  <span>
                    {formatDistanceToNow(new Date(r.created_at), {
                      addSuffix: true,
                      locale: arSA,
                    })}
                  </span>
                </span>
              }
              details={
                <div className="space-y-2">
                  {r.notes && <p>{r.notes}</p>}
                  {r.photo_url && (
                    <a href={r.photo_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={r.photo_url}
                        alt="المنتج"
                        className="h-40 w-full rounded-lg border border-border object-cover"
                      />
                    </a>
                  )}
                </div>
              }
              onApprove={() => decide(r.id, 'approved')}
              onReject={() => decide(r.id, 'rejected')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
