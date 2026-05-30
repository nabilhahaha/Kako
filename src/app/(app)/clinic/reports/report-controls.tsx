'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

/** From/To date pickers that drive the report via URL params. */
export function DateRangeFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function update(key: 'from' | 'to', val: string) {
    const params = new URLSearchParams(sp.toString());
    if (val) params.set(key, val);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">من</Label>
        <Input type="date" dir="ltr" value={from} onChange={(e) => update('from', e.target.value)} className="w-40" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">إلى</Label>
        <Input type="date" dir="ltr" value={to} onChange={(e) => update('to', e.target.value)} className="w-40" />
      </div>
    </div>
  );
}

/** Daily-income bar chart for the selected period. */
export function IncomeChart({ data }: { data: { day: string; revenue: number }[] }) {
  if (data.length === 0) {
    return <p className="p-8 text-center text-sm text-muted-foreground">لا توجد بيانات في هذه الفترة.</p>;
  }
  return (
    <div className="h-72 w-full p-2" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} width={48} />
          <Tooltip
            formatter={(v: number | string) => [Number(v).toLocaleString('en'), 'الإيراد']}
            labelStyle={{ direction: 'ltr' }}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar dataKey="revenue" fill="#8f1d2e" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
