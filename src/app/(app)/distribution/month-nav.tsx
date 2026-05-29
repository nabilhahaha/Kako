'use client';

import { useRouter } from 'next/navigation';

/** A month picker that navigates to `${base}?month=YYYY-MM`. */
export function MonthNav({ month, base }: { month: string; base: string }) {
  const router = useRouter();
  return (
    <input
      type="month"
      value={month}
      onChange={(e) => e.target.value && router.push(`${base}?month=${e.target.value}`)}
      dir="ltr"
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
    />
  );
}
