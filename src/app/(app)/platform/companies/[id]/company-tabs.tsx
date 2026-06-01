import Link from 'next/link';
import { cn } from '@/lib/utils';

export type CompanyTabKey =
  | 'overview' | 'subscription' | 'users' | 'roles' | 'permissions'
  | 'modules' | 'packs' | 'integrations' | 'audit';

export const COMPANY_TAB_ORDER: CompanyTabKey[] = [
  'overview', 'subscription', 'users', 'roles', 'permissions',
  'modules', 'packs', 'integrations', 'audit',
];

/** URL-param tab bar for the company detail page (deep-linkable via ?tab=). */
export function CompanyTabs({
  id,
  active,
  labels,
}: {
  id: string;
  active: CompanyTabKey;
  labels: Record<CompanyTabKey, string>;
}) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b">
      {COMPANY_TAB_ORDER.map((k) => (
        <Link
          key={k}
          href={`/platform/companies/${id}?tab=${k}`}
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
