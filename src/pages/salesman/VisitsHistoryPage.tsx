import { useMemo } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { SkeletonRow } from '@/components/shared/SkeletonCard';
import { Button } from '@/components/ui/button';
import { VisitCard } from '@/components/visit/VisitCard';
import { useVisits } from '@/hooks/useVisits';
import { useCustomers } from '@/hooks/useCustomers';
import { useAuthStore } from '@/stores/authStore';

export function VisitsHistoryPage() {
  const userId = useAuthStore((s) => s.profile?.id);
  const visitsQ = useVisits(userId);
  const customersQ = useCustomers(userId);

  const customerById = useMemo(() => {
    const map = new Map<string, string>();
    (customersQ.data ?? []).forEach((c) => {
      map.set(c.id, c.customer_name_ar || c.customer_name || c.customer_code);
    });
    return map;
  }, [customersQ.data]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="سجل الزيارات"
        description={`آخر ${visitsQ.data?.length ?? 0} زيارة`}
        back="/supervisor"
        actions={
          <Button asChild>
            <Link to="/supervisor/visits/new">
              <Plus className="h-4 w-4" />
              زيارة جديدة
            </Link>
          </Button>
        }
      />

      {visitsQ.isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
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
          icon={ClipboardList}
          title="لا توجد زيارات بعد"
          description="ابدأ زيارتك الأولى لتظهر هنا."
          actionLabel="زيارة جديدة"
          onAction={() => (window.location.href = '/supervisor/visits/new')}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visitsQ.data.map((v) => (
            <VisitCard
              key={v.id}
              visit={v}
              customerName={customerById.get(v.customer_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
