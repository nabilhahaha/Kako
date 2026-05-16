import { useMemo } from 'react';
import { MapPin, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { LiveMap } from '@/components/supervisor/LiveMap';
import { useTeamReps } from '@/hooks/useTeam';
import { useLiveMapData } from '@/hooks/useLiveMap';
import { useAuthStore } from '@/stores/authStore';

export function LiveMapPage() {
  const supervisorId = useAuthStore((s) => s.profile?.id);
  const repsQ = useTeamReps(supervisorId);
  const repIds = useMemo(() => (repsQ.data ?? []).map((r) => r.id), [repsQ.data]);
  const mapQ = useLiveMapData(supervisorId, repIds);

  const repsById = useMemo(() => {
    const m = new Map<string, { name: string }>();
    (repsQ.data ?? []).forEach((r) =>
      m.set(r.id, { name: r.full_name ?? r.email ?? 'مندوب' }),
    );
    return m;
  }, [repsQ.data]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="الخريطة المباشرة"
        description="مواقع المندوبين خلال 24 ساعة + عملاؤك"
        back="/supervisor"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => mapQ.refetch()}
            disabled={mapQ.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${mapQ.isFetching ? 'animate-spin' : ''}`}
            />
            تحديث
          </Button>
        }
      />

      {repsQ.isLoading || mapQ.isLoading ? (
        <Skeleton className="h-[calc(100vh-12rem)] w-full rounded-xl" />
      ) : mapQ.isError ? (
        <ErrorState
          message={(mapQ.error as Error)?.message}
          onRetry={() => mapQ.refetch()}
        />
      ) : !repIds.length ? (
        <EmptyState
          icon={MapPin}
          title="لا يوجد فريق لعرضه"
          description="أضف مندوبين تحت إشرافك لتظهر مواقعهم هنا."
        />
      ) : (
        <>
          <LiveMap
            customers={mapQ.data?.customers ?? []}
            recentVisits={mapQ.data?.recentVisits ?? []}
            repsById={repsById}
          />
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-4 text-caption">
              <LegendDot color="#10B981" label="Grade A" />
              <LegendDot color="#F59E0B" label="Grade B" />
              <LegendDot color="#9CA3AF" label="Grade C" />
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" /> آخر موقع للمندوب
              </span>
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
