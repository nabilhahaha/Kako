import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  icon: Icon,
  tint = 'text-accent bg-accent-soft',
  index = 0,
}: {
  label: string
  value: number | string
  icon: LucideIcon
  tint?: string
  index?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', damping: 24, stiffness: 300 }}
      className="rounded-card bg-surface p-4 shadow-card"
    >
      <div className={cn('mb-3 flex h-9 w-9 items-center justify-center rounded-xl', tint)}>
        <Icon size={17} />
      </div>
      <p className="text-[26px] font-bold leading-none tracking-tight">{value}</p>
      <p className="mt-1.5 text-[13px] font-medium text-ink-2">{label}</p>
    </motion.div>
  )
}
