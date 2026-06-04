import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Consistent back link for detail / sub pages. The chevron flips automatically
 *  for RTL (`rtl:rotate-180`), so callers pass a plain href + translated label
 *  and get the same look everywhere. Replaces the ad-hoc inline links that used
 *  mixed ArrowLeft/ArrowRight icons. */
export function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground',
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {label}
    </Link>
  );
}
