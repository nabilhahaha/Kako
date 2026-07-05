import { Tag } from 'lucide-react'
import { categoryLabel, isCategorySet } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Customer, CustomerRef } from '@/types'

/** Small rounded category pill shown under customer names and in details.
 *  Renders a muted "Category Not Set" state when no category is chosen. */
export function CategoryBadge({
  customer,
  size = 'sm',
  withIcon = false,
  className,
}: {
  customer: Pick<Customer, 'customer_category' | 'custom_category'> | CustomerRef | null | undefined
  size?: 'sm' | 'md'
  withIcon?: boolean
  className?: string
}) {
  const set = isCategorySet(customer)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold',
        set ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-3',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      {withIcon && <Tag size={size === 'sm' ? 10 : 12} />}
      {categoryLabel(customer)}
    </span>
  )
}
