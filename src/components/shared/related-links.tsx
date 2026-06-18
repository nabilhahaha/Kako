import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';

/** A small row of "related screens" pill links shown under a page header, so
 *  users hop between connected settings (e.g. Tax & Currency ↔ Tax Registrations
 *  ↔ Document Numbering) without going back to the sidebar. Pure navigation. */
export function RelatedLinks({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; icon?: LucideIcon }[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {i.icon && <i.icon className="h-3.5 w-3.5" />}
          {i.label}
          <ArrowRight className="h-3 w-3 rtl:rotate-180" />
        </Link>
      ))}
    </div>
  );
}
