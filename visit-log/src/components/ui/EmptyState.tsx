import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: LucideIcon
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 24, stiffness: 260 }}
      className="flex flex-col items-center px-8 py-16 text-center"
    >
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-accent-soft">
        <Icon className="h-9 w-9 text-accent" strokeWidth={1.8} />
      </div>
      <h3 className="text-[19px] font-bold">{title}</h3>
      <p className="mt-1.5 max-w-[260px] text-[15px] leading-snug text-ink-2">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  )
}
