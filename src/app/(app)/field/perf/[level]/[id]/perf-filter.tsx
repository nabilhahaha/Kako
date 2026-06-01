'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/provider';

const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

/** View + channel filters for a perf node. Filters are ANDed with the user's
 *  hierarchy scope server-side (Effective = Scope AND Filters). */
export function PerfViewFilter({ view, channel, channels }: { view: string; channel: string | null; channels: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  function go(next: { view?: string; channel?: string | null }) {
    const v = next.view ?? view;
    const ch = next.channel === undefined ? channel : next.channel;
    const params = new URLSearchParams();
    params.set('view', v);
    if (ch) params.set('channel', ch);
    router.push(`${pathname}?${params.toString()}`);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={selectCls} value={view} onChange={(e) => go({ view: e.target.value })}>
        {['daily', 'weekly', 'monthly'].map((v) => <option key={v} value={v}>{t(`field.dashboard.${v}`)}</option>)}
      </select>
      {channels.length > 0 && (
        <select className={selectCls} value={channel ?? ''} onChange={(e) => go({ channel: e.target.value || null })}>
          <option value="">{t('field.perf.allChannels')}</option>
          {channels.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
        </select>
      )}
    </div>
  );
}
