import { useMemo } from 'react';
import {
  Users,
  Map as MapIcon,
  CheckSquare,
  Package2,
  FileText,
  Clock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TeamMemberCard } from '@/components/supervisor/TeamMemberCard';
import { useTeamReps, useTeamPerformance } from '@/hooks/useTeam';
import { useAuthStore } from '@/stores/authStore';
import type { TeamMemberPerformance } from '@/lib/types';

export function TeamDashboard() {
  const profile = useAuthStore((s) => s.profile);
  const supervisorId = profile?.id;

  const repsQ = useTeamReps(supervisorId);
  const perfQ = useTeamPerformance(supervisorId);

  const perfById = useMemo(() => {
    const map = new Map<string, TeamMemberPerformance>();
    (perfQ.data ?? []).forEach((p) => map.set(p.user_id, p));
    return map;
  }, [perfQ.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`أهلاً ${profile?.full_name?.split(' ')[0] ?? ''}`.trim() || 'لوحة المشرف'}
        description="نظرة عامة على أداء فريقك"
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink to="/supervisor/map" icon={MapIcon} label="الخريطة المباشرة" />
        <QuickLink to="/supervisor/approvals/visits" icon={CheckSquare} label="موافقات الزيارات" />
        <QuickLink to="/supervisor/approvals/near-expiry" icon={Package2} label="قارب على الانتهاء" />
        <QuickLink to="/supervisor/visit-requests" icon={FileText} label="طلبات الزيارة" />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h2 text-foreground">فريقك</h2>
          <Link to="/supervisor/financial-requests" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <Clock className="h-4 w-4" />
            طلبات البيانات المالية
          </Link>
        </div>

        {repsQ.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="mt-5 h-16 w-full rounded-lg" />
              </Card>
            ))}
          </div>
        ) : repsQ.isError ? (
          <ErrorState
            message={(repsQ.error as Error)?.message}
            onRetry={() => repsQ.refetch()}
          />
        ) : !repsQ.data?.length ? (
          <EmptyState
            icon={Users}
            title="لا يوجد مندوبون تحت إشرافك"
            description="تواصل مع الإدارة لإضافة المندوبين لفريقك."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {repsQ.data.map((rep) => (
              <TeamMemberCard
                key={rep.id}
                rep={rep}
                performance={perfById.get(rep.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof MapIcon;
  label: string;
}) {
  return (
    <Link to={to} className="group">
      <Card className="flex items-center gap-3 p-4 transition-all hover:border-primary/40 hover:shadow-md">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <span className="font-medium text-foreground">{label}</span>
      </Card>
    </Link>
  );
}
