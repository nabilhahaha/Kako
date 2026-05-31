import { cn } from '@/lib/utils';

/** VANTORA brand mark — a gradient "V". Use `withWordmark` to show the name. */
export function Logo({
  withWordmark = false,
  size = 'md',
  className,
}: {
  withWordmark?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const mark = size === 'lg' ? 'h-10 w-10' : size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const word = size === 'lg' ? 'text-2xl' : 'text-lg';
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <svg viewBox="0 0 48 48" role="img" aria-label="VANTORA" className={cn('shrink-0', mark)}>
        <defs>
          <linearGradient id="velora-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0f2c52" />
            <stop offset="0.55" stopColor="#0e5e8a" />
            <stop offset="1" stopColor="#0bc5da" />
          </linearGradient>
        </defs>
        <path d="M3 9 L14 9 L24 30 L34 9 L45 9 L24 43 Z" fill="url(#velora-mark)" />
      </svg>
      {withWordmark && (
        <span dir="ltr" className="flex flex-col leading-none">
          <span className={cn('font-bold tracking-tight', word)}>VANTORA</span>
          <span className="mt-0.5 text-[0.6rem] font-medium uppercase tracking-[0.25em] text-muted-foreground">Business OS</span>
        </span>
      )}
    </span>
  );
}
