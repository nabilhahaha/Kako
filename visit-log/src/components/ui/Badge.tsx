import { cn } from '@/lib/utils'
import { VISIT_STATUS_META, VISIT_TYPE_META } from '@/lib/constants'
import type { VisitStatus, VisitType } from '@/types'

export function StatusBadge({ status, className }: { status: VisitStatus; className?: string }) {
  const meta = VISIT_STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        meta.badge,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function TypeBadge({ type, className }: { type: VisitType; className?: string }) {
  const meta = VISIT_TYPE_META[type]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2',
        className,
      )}
    >
      <Icon size={12} />
      {meta.label}
    </span>
  )
}
