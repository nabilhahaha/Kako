import { Building2, Store, Truck, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisitType } from '@/lib/types';

const OPTIONS: { value: VisitType; label: string; icon: typeof Building2 }[] = [
  { value: 'office', label: 'مكتب', icon: Building2 },
  { value: 'branch', label: 'فرع', icon: Store },
  { value: 'cashvan', label: 'كاش فان', icon: Truck },
  { value: 'hybrid', label: 'هجين', icon: Layers },
];

interface VisitTypePickerProps {
  value: VisitType | null;
  onChange: (v: VisitType) => void;
}

export function VisitTypePicker({ value, onChange }: VisitTypePickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all',
              selected
                ? 'border-primary bg-primary/5 text-primary shadow-sm'
                : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
            aria-pressed={selected}
          >
            <Icon className="h-5 w-5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
