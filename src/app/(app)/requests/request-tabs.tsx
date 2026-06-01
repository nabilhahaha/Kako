import Link from 'next/link';
import { cn } from '@/lib/utils';

export type RequestTabKey = 'inbox' | 'mine' | 'history';
export const REQUEST_TAB_ORDER: RequestTabKey[] = ['inbox', 'mine', 'history'];

/** URL-param tab bar for the Request & Approval Center. */
export function RequestTabs({
  active,
  labels,
}: {
  active: RequestTabKey;
  labels: Record<RequestTabKey, string>;
}) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b">
      {REQUEST_TAB_ORDER.map((k) => (
        <Link
          key={k}
          href={`/requests?tab=${k}`}
          scroll={false}
          className={cn(
            'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            active === k
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {labels[k]}
        </Link>
      ))}
    </div>
  );
}
