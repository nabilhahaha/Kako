'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Consistent Back control for detail / sub pages. Resolves the target in a
 *  three-tier priority so a deep link / fresh tab never dead-ends:
 *
 *    1. Browser history — the previous page (router.back).
 *    2. `href` — the screen's logical PARENT page (when there's no history).
 *    3. `home` — the role home, used only when no parent is given.
 *
 *  Every operational screen passes its real parent as `href` (not just My Day);
 *  `home` is the ultimate role-home fallback. Same look + behaviour on mobile and
 *  desktop; the chevron flips for RTL. */
export function BackLink({
  href,
  home,
  label,
  className,
}: {
  /** Logical parent page — where "up" leads when there's no history. */
  href: string;
  /** Ultimate role-home fallback (used only if `href` is empty). */
  home?: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  function go() {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(href || home || '/today');
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
