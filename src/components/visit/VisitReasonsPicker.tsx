import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisitReason } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

interface VisitReasonsPickerProps {
  reasons: VisitReason[] | undefined;
  loading?: boolean;
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function VisitReasonsPicker({
  reasons,
  loading,
  selected,
  onChange,
}: VisitReasonsPickerProps) {
  if (loading) {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
    );
  }

  if (!reasons?.length) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-center text-caption">
        لا توجد أسباب زيارة مفعّلة
      </p>
    );
  }

  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {reasons.map((r) => {
        const active = selected.includes(r.id);
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => toggle(r.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
            aria-pressed={active}
          >
            {active && <Check className="h-3.5 w-3.5" />}
            {r.reason_name_ar || r.reason_name_en}
          </button>
        );
      })}
    </div>
  );
}
