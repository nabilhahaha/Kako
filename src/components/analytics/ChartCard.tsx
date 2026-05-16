import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

interface ChartCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  height?: number;
}

export function ChartCard({
  title,
  description,
  action,
  children,
  height = 280,
}: ChartCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-h3 text-foreground">{title}</h3>
          {description && <p className="text-caption">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4 w-full" style={{ height }}>
        {children}
      </div>
    </Card>
  );
}

export const CHART_PALETTE = {
  primary: '#DC2626',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
  muted: '#9CA3AF',
  series: ['#DC2626', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'],
};
