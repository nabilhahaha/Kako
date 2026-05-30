import { cn } from '@/lib/utils';

/** AMS brand mark — a monogram of the three letters. Use `withWordmark` to show
 *  the name beside it. */
export function Logo({
  withWordmark = false,
  size = 'md',
  className,
}: {
  withWordmark?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const box = size === 'lg' ? 'h-11 w-11 text-sm' : size === 'sm' ? 'h-8 w-8 text-[10px]' : 'h-9 w-9 text-xs';
  const word = size === 'lg' ? 'text-2xl' : 'text-lg';
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span
        dir="ltr"
        aria-label="AMS"
        className={cn('flex shrink-0 items-center justify-center rounded-lg bg-primary font-bold tracking-tight text-primary-foreground', box)}
      >
        AMS
      </span>
      {withWordmark && <span dir="ltr" className={cn('font-bold tracking-tight', word)}>AMS</span>}
    </span>
  );
}
