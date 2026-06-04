import Link from 'next/link';
import { ArrowRight, CheckCircle2, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import type { AttentionItem } from '@/app/(app)/copilot/actions';

/** Shared presentational widgets for the role homes / centers. Server-rendered,
 *  no client JS; all strings are passed in already-localized. Reuses Badge +
 *  EmptyState for consistency. */

const SEVERITY_VARIANT: Record<AttentionItem['severity'], 'info' | 'warning' | 'destructive'> = {
  info: 'info',
  warning: 'warning',
  danger: 'destructive',
};

/** Exceptions-first ranked list of attention items, each a one-tap link. */
export function AttentionList({
  items,
  openLabel,
  emptyTitle,
}: {
  items: AttentionItem[];
  openLabel: string;
  emptyTitle: string;
}) {
  if (items.length === 0) return <EmptyState icon={<CheckCircle2 />} title={emptyTitle} />;
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i}>
          <Link
            href={it.href}
            className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-secondary/50"
          >
            <span className="flex items-center gap-3">
              <Badge variant={SEVERITY_VARIANT[it.severity]}>{it.count}</Badge>
              <span className="text-sm font-medium">{it.title}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {openLabel}
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export interface QuickLink {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** A grid of quick-navigation tiles (the "fast path" to deep screens). */
export function QuickNav({ links }: { links: QuickLink[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {links.map((l, i) => {
        const Icon = l.icon;
        return (
          <Link
            key={i}
            href={l.href}
            className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-secondary/50"
          >
            <Icon className="h-5 w-5 shrink-0 text-primary" />
            <span className="text-sm font-medium">{l.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
