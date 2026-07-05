import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

/** Minimal 14-day activity bar chart — pure CSS, no chart library weight. */
export function DailyBarChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div>
      <div className="flex h-32 items-end gap-1.5">
        {data.map((day, index) => {
          const height = day.count === 0 ? 4 : Math.max(10, (day.count / max) * 100)
          return (
            <div key={day.date} className="group relative flex-1">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ delay: index * 0.02, type: 'spring', damping: 24, stiffness: 260 }}
                className={cn(
                  'w-full rounded-full',
                  day.count === 0 ? 'bg-separator' : 'bg-accent',
                )}
                style={{ minHeight: 4 }}
              />
              {day.count > 0 && (
                <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-ink-2 opacity-0 transition-opacity group-hover:opacity-100">
                  {day.count}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-medium text-ink-3">
        <span>{format(new Date(`${data[0]?.date}T12:00:00`), 'd MMM')}</span>
        <span>Today</span>
      </div>
    </div>
  )
}

/** Horizontal distribution bars for type / status breakdowns. */
export function BreakdownBars({
  items,
}: {
  items: { label: string; count: number; color?: string }[]
}) {
  const total = Math.max(1, items.reduce((sum, item) => sum + item.count, 0))
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item.label}>
          <div className="mb-1 flex items-baseline justify-between text-[13px]">
            <span className="font-semibold">{item.label}</span>
            <span className="font-medium text-ink-2">{item.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(item.count / total) * 100}%` }}
              transition={{ delay: index * 0.05, type: 'spring', damping: 26, stiffness: 220 }}
              className={cn('h-full rounded-full', item.color ?? 'bg-accent')}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
