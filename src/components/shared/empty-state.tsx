import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Consistent empty state for list / table screens: optional icon, a title,
 *  optional description and an optional primary action (e.g. a "New …" button).
 *  Replaces the ad-hoc one-off empty strings scattered across list pages so
 *  every empty screen reads the same and can offer a clear next step. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground [&_svg]:h-6 [&_svg]:w-6">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
