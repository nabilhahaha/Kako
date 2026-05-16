import { useMemo } from 'react';
import { CheckSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonRow } from '@/components/shared/SkeletonCard';
import { ApprovalCard } from '@/components/supervisor/ApprovalCard';
import { usePendingVisits, useDecideVisit } from '@/hooks/useApprovals';
import { useTeamReps } from '@/hooks/useTeam';
import { useCustomers } from '@/hooks/useCustomers';
import { useAuthStore } from '@/stores/authStore';

const TYPE_LABELS: Record<string, string> = {
  office: 'مكتب',
  branch: 'فرع',
  cashvan: 'كاش فان',
  hybrid: 'هجين',
};

export function VisitApprovalsPage() {
  const supervisorId = useAuthStore((s) => s.profile?.id);
  const visitsQ = usePendingVisits(supervisorId);
  const repsQ = useTeamReps(supervisorId);
  const customersQ = useCustomers(supervisorId);
  const decide = useDecideVisit();

  const repName = useMemo(() => {
    const m = new Map<string, string>();
    (repsQ.data ?? []).forEach((r) => m.set(r.id, r.full_name ?? r.email ?? '—'));
    return m;
  }, [repsQ.data]);

  const customerName = useMemo(() => {
    const m = new Map<string, string>();
    (customersQ.data ?? []).forEach((c) =>
      m.set(c.id, c.customer_name_ar || c.customer_name || c.customer_code),
    );
    return m;
  }, [customersQ.data]);

  async function decideAndToast(
    visitId: string,
    decision: 'approved' | 'rejected',
  ) {
    if (!supervisorId) return;
    try {
      await decide.mutateAsync({ visitId, decision, supervisorId });
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
        title="موافقات الزيارات"
        description={`${visitsQ.data?.length ?? 0} زيارة بانتظار المراجعة`}
        back="/supervisor"
      />

      {visitsQ.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : visitsQ.isError ? (
        <ErrorState
          message={(visitsQ.error as Error)?.message}
          onRetry={() => visitsQ.refetch()}
        />
      ) : !visitsQ.data?.length ? (
        <EmptyState
          icon={CheckSquare}
          title="لا توجد زيارات معلّقة"
          description="ستظهر هنا الزيارات الجديدة بمجرد تسجيلها."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visitsQ.data.map((v) => (
            <ApprovalCard
              key={v.id}
              title={customerName.get(v.customer_id) ?? 'عميل غير معروف'}
              meta={
                <span className="flex flex-wrap items-center gap-2">
                  <span>{repName.get(v.salesman_id) ?? '—'}</span>
                  <span>·</span>
                  <span>{TYPE_LABELS[v.visit_type] ?? v.visit_type}</span>
                  <span>·</span>
                  <span>
                    {formatDistanceToNow(new Date(v.visited_at), {
                      addSuffix: true,
                      locale: arSA,
                    })}
                  </span>
                </span>
              }
              details={v.notes}
              onApprove={() => decideAndToast(v.id, 'approved')}
              onReject={() => decideAndToast(v.id, 'rejected')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
