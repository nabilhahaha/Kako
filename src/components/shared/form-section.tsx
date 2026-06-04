import { cn } from '@/lib/utils';

/** A titled form subsection: a small header + a responsive field grid. Used to
 *  group long forms into labeled sections (UX-2) instead of one flat grid, so a
 *  record reads as logical blocks (Identity / Contact / Commercial / …). */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
        {children}
      </div>
    </section>
  );
}
