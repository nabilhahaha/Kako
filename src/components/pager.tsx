import Link from 'next/link';
import { ChevronRight, ChevronLeft } from 'lucide-react';

/**
 * Simple page-based pager. Builds links to `?page=N` (preserving nothing else,
 * so use on pages whose only query param is the page number).
 */
export function Pager({
  page,
  pageSize,
  total,
  basePath,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-muted-foreground tabular-nums" dir="ltr">
        {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-2">
        <PagerLink href={`${basePath}?page=${page - 1}`} disabled={page <= 1}>
          <ChevronRight className="h-4 w-4" /> السابق
        </PagerLink>
        <span className="text-muted-foreground tabular-nums" dir="ltr">{page} / {pages}</span>
        <PagerLink href={`${basePath}?page=${page + 1}`} disabled={page >= pages}>
          التالي <ChevronLeft className="h-4 w-4" />
        </PagerLink>
      </div>
    </div>
  );
}

function PagerLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border px-3 py-1.5 text-muted-foreground opacity-50">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-secondary">
      {children}
    </Link>
  );
}
