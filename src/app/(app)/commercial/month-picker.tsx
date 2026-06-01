'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Month selector that pushes ?month=YYYY-MM-01 into the URL (server re-reads). */
export function MonthPicker({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <input type="month" value={month.slice(0, 7)} className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        next.set('month', `${e.target.value}-01`);
        router.push(`${pathname}?${next.toString()}`);
      }} />
  );
}
