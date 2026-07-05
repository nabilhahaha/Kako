import { useSignedUrls } from '@/hooks/queries'
import { useCustomerCovers } from '@/hooks/queries'
import { PhotoImg } from '@/components/photos/PhotoImg'
import { cn } from '@/lib/utils'
import type { Customer } from '@/types'

/**
 * Customer thumbnail: the latest storefront photo when one exists, otherwise a
 * lettered fallback. `covers`/`urls` can be passed in to avoid per-row queries
 * in long lists.
 */
export function CustomerAvatar({
  customer,
  thumbUrl,
  className,
  rounded = 'rounded-2xl',
}: {
  customer: Pick<Customer, 'id' | 'name'>
  thumbUrl?: string
  className?: string
  rounded?: string
}) {
  if (thumbUrl) {
    return (
      <PhotoImg
        url={thumbUrl}
        alt={customer.name}
        className={cn('shrink-0 bg-accent-soft', rounded, className)}
      />
    )
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center bg-accent-soft font-bold text-accent',
        rounded,
        className,
      )}
    >
      {customer.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/**
 * Resolves signed thumbnail URLs for a set of customer covers in one request.
 * Returns a map of customer_id → signed thumbnail URL.
 */
export function useCustomerThumbUrls(customerIds: string[]) {
  const covers = useCustomerCovers()
  const thumbPaths: string[] = []
  const byCustomer: Record<string, string> = {}
  for (const id of customerIds) {
    const cover = covers.data?.[id]
    if (cover) {
      byCustomer[id] = cover.thumb
      thumbPaths.push(cover.thumb)
    }
  }
  const { data: urls } = useSignedUrls(thumbPaths)
  const resolve = (customerId: string): string | undefined => {
    const path = byCustomer[customerId]
    return path ? urls?.[path] : undefined
  }
  return resolve
}
