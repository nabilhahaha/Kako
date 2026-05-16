import { cn } from '@/lib/utils';

const GRADE_STYLES: Record<string, string> = {
  A: 'bg-success/15 text-success ring-1 ring-inset ring-success/30',
  B: 'bg-warning/15 text-warning ring-1 ring-inset ring-warning/30',
  C: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
};

export function GradeBadge({
  grade,
  size = 'sm',
}: {
  grade: string | null | undefined;
  size?: 'sm' | 'lg';
}) {
  const g = (grade ?? '?').toUpperCase();
  const style = GRADE_STYLES[g] ?? GRADE_STYLES.C;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold tabular-nums',
        size === 'sm' ? 'h-7 min-w-7 px-2 text-xs' : 'h-10 min-w-10 px-3 text-base',
        style,
      )}
      aria-label={`Grade ${g}`}
    >
      {g}
    </span>
  );
}
