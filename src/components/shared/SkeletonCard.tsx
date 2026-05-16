import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function SkeletonKPI() {
  return (
    <Card className="p-6">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-9 w-32" />
      <Skeleton className="mt-3 h-3 w-20" />
    </Card>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-6 w-8 rounded-full" />
        </div>
        <Skeleton className="h-3 w-32" />
      </div>
    </Card>
  );
}
