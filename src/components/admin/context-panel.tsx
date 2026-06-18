import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/** ContextPanel — right panel: ordered sections (Summary · Activity · Audit ·
 *  Shortcuts · Related). Generic; reused by every admin module. No logic. */
export function ContextPanel({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

export function ContextSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {children}
      </CardContent>
    </Card>
  );
}

/** A keyed summary list (label → value). */
export function SummaryList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="space-y-1 text-sm">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 truncate text-end font-medium">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A deep link (e.g. into the Audit Log or a related workbench). */
export function ContextLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
      {label} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
    </Link>
  );
}

/** Related-object chips that deep-link to other workbenches. */
export function RelatedChips({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it, i) =>
        it.href ? (
          <Link key={i} href={it.href} className="rounded-full border px-2 py-0.5 text-xs hover:bg-secondary">{it.label}</Link>
        ) : (
          <span key={i} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{it.label}</span>
        ),
      )}
    </div>
  );
}
