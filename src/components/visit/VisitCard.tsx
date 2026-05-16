import { MapPin, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Visit } from '@/lib/types';

const TYPE_LABELS: Record<string, string> = {
  office: 'مكتب',
  branch: 'فرع',
  cashvan: 'كاش فان',
  hybrid: 'هجين',
};

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'info' | 'secondary'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'secondary',
  completed: 'info',
};

const STATUS_LABELS: Record<string, string> = {
  approved: 'موافق عليها',
  pending: 'قيد المراجعة',
  rejected: 'مرفوضة',
  completed: 'مكتملة',
};

interface VisitCardProps {
  visit: Visit;
  customerName?: string;
}

export function VisitCard({ visit, customerName }: VisitCardProps) {
  const typeLabel = TYPE_LABELS[visit.visit_type] ?? visit.visit_type;
  const statusVariant = visit.status ? STATUS_VARIANTS[visit.status] ?? 'secondary' : 'secondary';
  const statusLabel = visit.status ? STATUS_LABELS[visit.status] ?? visit.status : '—';

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate font-medium text-foreground">
            {customerName ?? 'عميل غير معروف'}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDistanceToNow(new Date(visit.visited_at), {
                addSuffix: true,
                locale: arSA,
              })}
            </span>
            <span>· {typeLabel}</span>
            {visit.latitude != null && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> موقع
              </span>
            )}
          </div>
        </div>
        <Badge variant={statusVariant} className="shrink-0">
          {statusLabel}
        </Badge>
      </div>
      {visit.notes && (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{visit.notes}</p>
      )}
    </Card>
  );
}
