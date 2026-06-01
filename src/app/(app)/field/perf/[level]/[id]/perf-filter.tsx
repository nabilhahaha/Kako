'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/provider';

/** Date/view selector for a perf node (daily/weekly/monthly). */
export function PerfViewFilter({ view }: { view: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      value={view}
      onChange={(e) => router.push(`${pathname}?view=${e.target.value}`)}
    >
      {['daily', 'weekly', 'monthly'].map((v) => <option key={v} value={v}>{t(`field.dashboard.${v}`)}</option>)}
    </select>
  );
}
