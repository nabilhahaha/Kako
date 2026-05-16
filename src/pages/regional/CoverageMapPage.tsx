import { MapPin, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { CoverageMap } from '@/components/analytics/CoverageMap';
import { useCoverageCustomers } from '@/hooks/useCoverageMap';
import { useAuthStore } from '@/stores/authStore';

export function CoverageMapPage() {
  const region = useAuthStore((s) => s.profile?.region ?? null);
  const customersQ = useCoverageCustomers(region);

  return (
    <div className="space-y-5">
      <PageHeader
        title="خريطة تغطية العملاء"
        description={`${customersQ.data?.length ?? 0} عميل${region ? ` في ${region}` : ''}`}
        back="/regional"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => customersQ.refetch()}
            disabled={customersQ.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${customersQ.isFetching ? 'animate-spin' : ''}`} />
            تحديث
          </Button>
        }
      />

      {customersQ.isLoading ? (
        <Skeleton className="h-[calc(100vh-14rem)] w-full rounded-xl" />
      ) : customersQ.isError ? (
        <ErrorState
          message={(customersQ.error as Error)?.message}
          onRetry={() => customersQ.refetch()}
        />
      ) : !customersQ.data?.length ? (
        <EmptyState
          icon={MapPin}
          title="لا توجد إحداثيات بعد"
          description="لم يتم تسجيل موقع لأي عميل في إقليمك."
        />
      ) : (
        <>
          <CoverageMap customers={customersQ.data} />
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-4 text-caption">
              <LegendDot color="#10B981" label="Grade A" />
              <LegendDot color="#F59E0B" label="Grade B" />
              <LegendDot color="#9CA3AF" label="Grade C" />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
