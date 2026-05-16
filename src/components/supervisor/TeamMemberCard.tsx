import { Target, ShoppingBag, MapPinCheck, User } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatNumber, initialsFromEmail } from '@/lib/utils';
import type { AppUser, TeamMemberPerformance } from '@/lib/types';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  excellent: 'success',
  good: 'success',
  average: 'warning',
  poor: 'destructive',
};

const STATUS_LABELS: Record<string, string> = {
  excellent: 'ممتاز',
  good: 'جيد',
  average: 'متوسط',
  poor: 'ضعيف',
};

interface TeamMemberCardProps {
  rep: AppUser;
  performance: TeamMemberPerformance | undefined;
}

export function TeamMemberCard({ rep, performance }: TeamMemberCardProps) {
  const statusKey = performance?.performance_status?.toLowerCase() ?? '';
  const statusVariant = STATUS_TONE[statusKey] ?? 'secondary';
  const statusLabel = STATUS_LABELS[statusKey] ?? '—';

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <Avatar className="h-11 w-11 border border-border">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {initialsFromEmail(rep.email)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">
            {rep.full_name || rep.email}
          </p>
          <p className="text-caption inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            {rep.region ?? 'بدون إقليم'}
          </p>
        </div>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Stat
          icon={Target}
          label="Strike"
          value={`${formatNumber(performance?.strike_rate ?? 0)}%`}
        />
        <Stat
          icon={ShoppingBag}
          label="Drop"
          value={formatNumber(performance?.drop_size ?? 0)}
        />
        <Stat
          icon={MapPinCheck}
          label="Coverage"
          value={`${formatNumber(performance?.coverage_percent ?? 0)}%`}
        />
      </div>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Target;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-base font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
