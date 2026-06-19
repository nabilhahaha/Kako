'use client';

import Link from 'next/link';
import { LayoutDashboard, ListChecks, Users } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';

/**
 * CV-3 — shared Coverage sub-navigation. Makes the coverage surfaces one coherent
 * area: the manager dashboard (strategic), the customer exception list, and the
 * operational team rep-day view (shown only when the distribution flag is on).
 * Pure links; the active view is highlighted.
 */
export type CoverageView = 'dashboard' | 'customers' | 'team';

export function CoverageViews({ active, showTeam = false }: { active: CoverageView; showTeam?: boolean }) {
  const { t } = useI18n();
  const items: { key: CoverageView; href: string; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'dashboard', href: '/distribution/coverage-dashboard', label: t('coverage.viewDashboard'), icon: LayoutDashboard },
    { key: 'customers', href: '/distribution/coverage-customers', label: t('coverage.viewCustomers'), icon: ListChecks },
  ];
  if (showTeam) items.push({ key: 'team', href: '/distribution/coverage', label: t('coverage.viewTeam'), icon: Users });

  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b">
      {items.map(({ key, href, label, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={key === active ? 'page' : undefined}
          className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
            key === active ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </div>
  );
}
