import { cn } from '@/lib/utils';

function healthTone(score: number) {
  if (score >= 75) return { color: 'text-success', bg: 'bg-success', label: 'ممتاز' };
  if (score >= 50) return { color: 'text-warning', bg: 'bg-warning', label: 'جيد' };
  if (score >= 25)
    return { color: 'text-destructive', bg: 'bg-destructive', label: 'يحتاج اهتمام' };
  return { color: 'text-destructive', bg: 'bg-destructive', label: 'حرج' };
}

interface HealthScoreProps {
  score: number | null | undefined;
  className?: string;
}

export function HealthScore({ score, className }: HealthScoreProps) {
  const value = Math.max(0, Math.min(100, Number(score ?? 0)));
  const tone = healthTone(value);

  return (
    <div className={cn('rounded-xl bg-muted/40 p-5', className)}>
      <p className="text-caption uppercase tracking-wide">نقاط الصحة</p>
      <div className="mt-2 flex items-baseline gap-3">
        <p className={cn('text-display tabular-nums', tone.color)}>{value}</p>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white',
            tone.bg,
          )}
        >
          {tone.label}
        </span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-border">
        <div
          className={cn('h-full transition-[width] duration-500', tone.bg)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
