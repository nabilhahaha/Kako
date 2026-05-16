import { useMemo } from 'react';
import { Package2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonRow } from '@/components/shared/SkeletonCard';
import { ApprovalCard } from '@/components/supervisor/ApprovalCard';
import { usePendingNearExpiry, useDecideNearExpiry } from '@/hooks/useApprovals';
import { useCustomers } from '@/hooks/useCustomers';
import { useProducts } from '@/hooks/useNearExpiry';
import { useAuthStore } from '@/stores/authStore';
import { formatNumber } from '@/lib/utils';

export function NearExpiryApprovalsPage() {
  const supervisorId = useAuthStore((s) => s.profile?.id);
  const recordsQ = usePendingNearExpiry(supervisorId);
  const customersQ = useCustomers(supervisorId);
  const productsQ = useProducts();
  const decide = useDecideNearExpiry();

  const customerName = useMemo(() => {
    const m = new Map<string, string>();
    (customersQ.data ?? []).forEach((c) =>
      m.set(c.id, c.customer_name_ar || c.customer_name || c.customer_code),
    );
    return m;
  }, [customersQ.data]);

  const productName = useMemo(() => {
    const m = new Map<string, string>();
    (productsQ.data ?? []).forEach((p) =>
      m.set(p.id, p.product_name_ar || p.product_name),
    );
    return m;
  }, [productsQ.data]);

  async function decideAndToast(recordId: string, decision: 'approved' | 'rejected') {
    if (!supervisorId) return;
    try {
      await decide.mutateAsync({ recordId, decision, supervisorId });
      toast.success(decision === 'approved' ? 'تمت الموافقة' : 'تم الرفض');
    } catch (err) {
      toast.error('فشل التحديث', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="موافقات قارب على الانتهاء"
        description={`${recordsQ.data?.length ?? 0} منتج بانتظار المراجعة (مرحلة المشرف)`}
        back="/supervisor"
      />

      {recordsQ.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : recordsQ.isError ? (
        <ErrorState
          message={(recordsQ.error as Error)?.message}
          onRetry={() => recordsQ.refetch()}
        />
      ) : !recordsQ.data?.length ? (
        <EmptyState
          icon={Package2}
          title="لا توجد طلبات معلّقة"
          description="ستظهر هنا التسجيلات الجديدة بمجرد إرسالها."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {recordsQ.data.map((r) => (
            <ApprovalCard
              key={r.id}
              title={productName.get(r.product_id) ?? 'منتج'}
              meta={
                <span className="flex flex-wrap items-center gap-2">
                  <span>{customerName.get(r.customer_id) ?? '—'}</span>
                  <span>·</span>
                  <span>الكمية {formatNumber(r.quantity)}</span>
                  <span>·</span>
                  <span>ينتهي {new Date(r.expiry_date).toLocaleDateString('ar-SA')}</span>
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
                    <a
                      href={r.photo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <img
                        src={r.photo_url}
                        alt="صورة المنتج"
                        className="h-40 w-full rounded-lg border border-border object-cover"
                      />
                    </a>
                  )}
                </div>
              }
              onApprove={() => decideAndToast(r.id, 'approved')}
              onReject={() => decideAndToast(r.id, 'rejected')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
