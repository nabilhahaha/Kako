import Link from 'next/link';
import { Receipt, Wallet, MapPin, Undo2, StickyNote, type LucideIcon } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { groupByDay, type TimelineEvent, type TimelineKind } from '@/lib/erp/timeline';
import { EmptyState } from '@/components/shared/empty-state';

/** Customer/record activity timeline (server-rendered). Adapts the CRM record-
 *  timeline pattern: grouped by day, newest first, with a typed icon per event. */

const KIND_ICON: Record<TimelineKind, LucideIcon> = {
  invoice: Receipt,
  payment: Wallet,
  visit: MapPin,
  return: Undo2,
  note: StickyNote,
};

export function ActivityTimeline({
  events,
  emptyTitle,
}: {
  events: TimelineEvent[];
  emptyTitle: string;
}) {
  const days = groupByDay(events);
  if (days.length === 0) return <EmptyState icon={<StickyNote />} title={emptyTitle} />;

  return (
    <div className="space-y-5">
      {days.map((d) => (
        <div key={d.day}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" dir="ltr">
            {formatDate(d.day)}
          </p>
          <ul className="space-y-2 border-s ps-4">
            {d.events.map((e, i) => {
              const Icon = KIND_ICON[e.kind] ?? StickyNote;
              const row = (
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium">{e.title}</span>
                  </span>
                  {e.amount != null && (
                    <span className="text-sm font-semibold tabular-nums" dir="ltr">{formatCurrency(Number(e.amount))}</span>
                  )}
                </div>
              );
              return (
                <li key={i} className="relative">
                  <span className="absolute -start-[1.30rem] top-4 h-2 w-2 rounded-full bg-primary" />
                  {e.href ? <Link href={e.href}>{row}</Link> : row}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
