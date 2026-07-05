import { Tag } from 'lucide-react'
import { categoryLabel } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Customer, CustomerRef } from '@/types'

/** Small rounded category pill shown under customer names and in details. */
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
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-accent-soft font-semibold text-accent',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      {withIcon && <Tag size={size === 'sm' ? 10 : 12} />}
      {categoryLabel(customer)}
    </span>
  )
}
