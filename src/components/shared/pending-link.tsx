'use client';

import Link from 'next/link';
import { useState, type ReactNode, type MouseEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Navigation button with immediate tap feedback: on the first tap it runs the
// optional onClick (telemetry / marker), swaps to a pending label + spinner, and
// blocks further taps until the route changes (this component unmounts on
// navigation, resetting state). Keeps real <Link> semantics + prefetch, so routes
// are unchanged. External links (target=_blank) don't enter the pending state.
export function PendingLink({
  href,
  children,
  pendingLabel,
  onClick,
  className,
  prefetch,
  target,
  rel,
  'aria-label': ariaLabel,
}: {
  href: string;
  children: ReactNode;
  /** Shown (with a spinner) while navigating, e.g. "Starting…". */
  pendingLabel?: string;
  onClick?: () => void;
  className?: string;
  prefetch?: boolean;
  target?: string;
  rel?: string;
  'aria-label'?: string;
}) {
  const [pending, setPending] = useState(false);
  const external = target === '_blank';

  function handle(e: MouseEvent<HTMLAnchorElement>) {
    if (pending) {
      e.preventDefault(); // double-tap guard
      return;
    }
    onClick?.();
    if (!external) setPending(true); // in-app navigation → show progress
  }

  return (
    <Link
      href={href}
      prefetch={prefetch}
      target={target}
      rel={rel}
      aria-label={ariaLabel}
      aria-busy={pending || undefined}
      className={cn(className, pending && 'pointer-events-none opacity-90')}
      onClick={handle}
    >
      {pending && pendingLabel ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {pendingLabel}
        </span>
      ) : (
        children
      )}
    </Link>
  );
}
