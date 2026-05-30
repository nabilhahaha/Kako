import { cn } from '@/lib/utils';

/** Velora brand mark — a gradient "V". Use `withWordmark` to show the name. */
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
      <svg viewBox="0 0 48 48" role="img" aria-label="Velora" className={cn('shrink-0', mark)}>
        <defs>
          <linearGradient id="velora-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a855f7" />
            <stop offset="0.5" stopColor="#6366f1" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <path d="M3 9 L14 9 L24 30 L34 9 L45 9 L24 43 Z" fill="url(#velora-mark)" />
      </svg>
      {withWordmark && (
        <span dir="ltr" className={cn('font-bold tracking-tight', word)}>Velora</span>
      )}
    </span>
  );
}
