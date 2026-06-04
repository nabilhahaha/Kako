'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/provider';

/** Primary affordance of this INFORMATION surface: a segmented control that
 *  widens/narrows the growth window (30 / 90 / 180 days). It only rewrites the
 *  `range` URL param; the server page re-derives the ranged signup counts.
 *  Read-only — no writes, no mutation of any record. */
export type GrowthRange = '30' | '90' | '180';
export const GROWTH_RANGES: GrowthRange[] = ['30', '90', '180'];

export function RangeSelector({ value }: { value: GrowthRange }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  const labels: Record<GrowthRange, string> = {
    '30': t('platformAnalytics.range30'),
    '90': t('platformAnalytics.range90'),
    '180': t('platformAnalytics.range180'),
  };

  function select(next: GrowthRange) {
    const query = next === '90' ? '' : `?range=${next}`; // 90d is the default
    start(() => router.push(`${pathname}${query}`));
  }

  return (
    <div className="flex flex-col gap-1.5 sm:items-end">
      <span className="text-xs text-muted-foreground">{t('platformAnalytics.rangeLabel')}</span>
      <div
        role="group"
        aria-label={t('platformAnalytics.rangeLabel')}
        className={`inline-flex rounded-lg border border-border bg-card p-1 ${pending ? 'opacity-60' : ''}`}
      >
        {GROWTH_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => select(r)}
            aria-pressed={value === r}
            className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors ${
              value === r
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {labels[r]}
          </button>
        ))}
      </div>
    </div>
  );
}
