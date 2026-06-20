'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { TopGroupingNav } from './top-grouping-nav';

interface Group { key: string; label: string; items: { label: string; href: string }[] }

/**
 * Settings navigation under the Navigation Standard ("One rail, then rise"): the
 * 18-page hub re-chunked into ≤5 top groups. Tier 1 = the groups; tier 2 = the
 * active group's pages. No persistent side rail — both tiers rise to the top,
 * preserving content width. Groups/pages are computed server-side
 * (permission-aware) and passed in; this component only renders + tracks the
 * active route. No business-logic / permission / RLS / workflow change.
 */
export function SettingsGroupNav({ groups }: { groups: Group[] }) {
  const { t } = useI18n();
  const pathname = usePathname();

  const isOn = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const activeGroup = useMemo(
    () => groups.find((g) => g.items.some((i) => isOn(i.href))) ?? null,
    [groups, pathname],
  );

  if (groups.length === 0) return null;

  return (
    <div className="space-y-1">
      <TopGroupingNav
        ariaLabel={t('settingsHome.title')}
        items={groups.map((g) => ({
          key: g.key,
          label: t(g.label),
          href: g.items[0].href,
          active: activeGroup?.key === g.key,
        }))}
        maxInline={7}
      />
      {activeGroup && activeGroup.items.length > 1 && (
        <TopGroupingNav
          size="sm"
          ariaLabel={t(activeGroup.label)}
          items={activeGroup.items.map((i) => ({
            key: i.href,
            label: t(i.label),
            href: i.href,
            active: isOn(i.href),
          }))}
        />
      )}
    </div>
  );
}
