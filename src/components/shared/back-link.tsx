'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Consistent Back control for detail / sub pages. Returns to the previous
 *  logical screen (browser history); when there's no in-app history (deep link /
 *  fresh tab) it falls back to `href` — the screen's logical parent, typically the
 *  role home (My Day for field users). Same look + behaviour on mobile and
 *  desktop; the chevron flips for RTL. */
export function BackLink({
  href,
  label,
  className,
}: {
  /** Fallback destination when there's no history to go back to. */
  href: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  function go() {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(href);
  }
  return (
    <button
      type="button"
      onClick={go}
      className={cn(
        'mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground',
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {label}
    </button>
  );
}
